import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { appendAuditEvent } from "@/lib/audit/chain";
import { enqueueOutbox } from "@/lib/outbox";
import { getPaynowField, initiatePaynowPayment, paynowFailureForDiagnostics, pollPaynow } from "@/lib/payments/paynow";
import { expireAgentCards, revokeRefundedPaymentTerm } from "@/lib/services/cards";

export async function createCardCheckout(input: {
  userId: string;
  email: string;
  name: string;
  planCode: string;
  idempotencyKey: string;
  payerAgencyId?: string;
  targetAgentProfileId?: string;
}) {
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.userId !== input.userId || existing.payerAgencyId !== (input.payerAgencyId ?? null) || existing.targetAgentProfileId !== (input.targetAgentProfileId ?? null)) {
      throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This request key is already in use.");
    }
    if (existing.redirectUrl) return { paymentId: existing.id, redirectUrl: existing.redirectUrl };
    throw new ApiError(409, "PAYMENT_IN_PROGRESS", "This payment request is already being prepared.");
  }

  const profile = input.targetAgentProfileId
    ? await prisma.agentProfile.findUnique({ where: { id: input.targetAgentProfileId }, include: { agency: true, user: true } })
    : input.payerAgencyId
      ? null
      : await prisma.agentProfile.findUnique({ where: { userId: input.userId }, include: { agency: true, user: true } });

  if (input.payerAgencyId) {
    const agency = await prisma.agency.findUnique({ where: { id: input.payerAgencyId } });
    if (!agency || agency.status !== "ACTIVE") throw new ApiError(409, "AGENCY_NOT_ACTIVE", "An active agency is required to purchase sponsored cards.");
    if (input.targetAgentProfileId && !profile) throw new ApiError(404, "AGENT_NOT_FOUND", "The selected agent could not be found.");
    if (profile && profile.agencyId !== input.payerAgencyId) throw new ApiError(403, "AGENT_AGENCY_MISMATCH", "The selected agent does not belong to this agency.");
    if (profile && (profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE" || profile.user.isSuspended || !profile.user.emailVerified)) throw new ApiError(409, "AGENT_NOT_ACTIVE", "Choose an active, verified agent in an active agency.");
  } else if (!profile || profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE" || profile.user.isSuspended || !profile.user.emailVerified) {
    throw new ApiError(403, "AGENT_PENDING", "Your agent profile must be approved before purchasing a card.");
  }

  const plan = await prisma.cardPlan.findUnique({ where: { code: input.planCode } });
  if (!plan || plan.status !== "ACTIVE") throw new ApiError(404, "PLAN_NOT_FOUND", "This card plan is not available.");
  if (!plan.priceApproved || !plan.priceAmount || plan.priceAmount.lessThanOrEqualTo(0)) {
    throw new ApiError(409, "PRICING_NOT_APPROVED", "Card pricing has not been approved for sale yet.");
  }

  if (profile) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AgentProfile" WHERE "id" = ${profile!.id} FOR UPDATE`);
      await expireAgentCards(tx, profile!.id, new Date(), input.userId);
      const pending = await tx.goldCard.findFirst({ where: { agentProfileId: profile!.id, status: { in: ["ASSIGNED", "SUSPENDED"] } }, select: { status: true } });
      if (pending?.status === "ASSIGNED") throw new ApiError(409, "CARD_ACTIVATION_PENDING", "Activate the assigned card before purchasing or renewing a seat.");
      if (pending?.status === "SUSPENDED") throw new ApiError(409, "CARD_SUSPENDED", "A suspended seat cannot be renewed. Contact platform support.");
    }, { isolationLevel: "Serializable" });
  }

  const paymentId = randomUUID();
  const reference = `PCZ-${paymentId}`;
  await prisma.payment.create({
    data: {
      id: paymentId,
      userId: input.userId,
      planId: plan.id,
      termDays: plan.durationDays,
      payerAgencyId: input.payerAgencyId,
      targetAgentProfileId: profile?.id,
      idempotencyKey: input.idempotencyKey,
      providerReference: reference,
      amount: plan.priceAmount,
      currency: plan.currency,
      status: "INITIATED",
    },
  });

  try {
    const provider = await initiatePaynowPayment({
      reference,
      amount: plan.priceAmount.toFixed(2),
      email: input.email,
      name: input.name,
    });
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "AWAITING_PAYMENT", redirectUrl: provider.redirectUrl, pollUrl: provider.pollUrl },
      });
      const outbox = await enqueueOutbox(tx, {
        topic: "payment.reconcile",
        aggregateType: "Payment",
        aggregateId: paymentId,
        payload: { paymentId },
      });
      await tx.outboxMessage.update({
        where: { id: outbox.id },
        data: { availableAt: new Date(Date.now() + 60_000) },
      });
      await appendAuditEvent(tx, {
        actorUserId: input.userId,
        agencyId: input.payerAgencyId ?? profile?.agencyId,
        action: "payment.checkout_started",
        entityType: "Payment",
        entityId: paymentId,
        payload: { planCode: plan.code, amount: plan.priceAmount?.toString(), currency: plan.currency, payerAgencyId: input.payerAgencyId ?? null, targetAgentProfileId: profile?.id ?? null },
      });
    });
    return { paymentId, redirectUrl: provider.redirectUrl };
  } catch (error) {
    const diagnostic = paynowFailureForDiagnostics(error);
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: "FAILED",
          failureReason: diagnostic ? `Paynow initiation failed: ${diagnostic}` : "Paynow initiation failed.",
        },
      });
      await appendAuditEvent(tx, {
        actorUserId: input.userId,
        agencyId: input.payerAgencyId ?? profile?.agencyId,
        action: "payment.checkout_failed",
        entityType: "Payment",
        entityId: paymentId,
        payload: { reason: "provider_initiation_failed" },
      });
    });
    if (diagnostic) console.warn("Paynow initiation failed", { reference, reason: diagnostic });
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "PAYNOW_UNAVAILABLE", "Paynow could not start this payment.");
  }
}

export async function receivePaynowResult(fields: URLSearchParams) {
  const reference = getPaynowField(fields, "reference");
  const status = getPaynowField(fields, "status")?.toLowerCase();
  if (!reference || !status) throw new ApiError(400, "INVALID_PAYNOW_RESULT", "The payment result is incomplete.");
  const payment = await prisma.payment.findUnique({ where: { providerReference: reference } });
  if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "The payment reference was not found.");

  const amount = getPaynowField(fields, "amount");
  if (!amount || !/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    await markPaymentForReview(payment.id, "missing_or_invalid_amount");
    throw new ApiError(400, "PAYMENT_AMOUNT_MISSING", "The payment requires manual review because its amount is missing or invalid.");
  }
  if (new Prisma.Decimal(amount).comparedTo(payment.amount) !== 0) {
    await markPaymentForReview(payment.id, "amount_mismatch");
    throw new ApiError(400, "PAYMENT_AMOUNT_MISMATCH", "The payment requires manual review.");
  }
  const currency = getPaynowField(fields, "currency");
  if (currency && currency.toUpperCase() !== payment.currency.toUpperCase()) {
    await markPaymentForReview(payment.id, "currency_mismatch");
    throw new ApiError(400, "PAYMENT_CURRENCY_MISMATCH", "The payment requires manual review.");
  }

  if (status === "paid") return activatePaidCard(payment.id, fields);
  if (["cancelled", "failed", "refunded", "disputed"].includes(status)) {
    await updateFailedPayment(payment.id, status, fields);
  } else if (!["ok", "message", "created", "sent", "delivered", "pending", "processing", "awaiting payment", "awaiting delivery"].includes(status)) {
    await markPaymentForReview(payment.id, `unrecognized_status:${status}`);
  }
  return { accepted: true, state: status };
}

async function activatePaidCard(paymentId: string, fields: URLSearchParams) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { plan: true, user: true, payerAgency: true },
    });
    if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "The payment reference was not found.");
    const existingCard = payment.cardId ? await tx.goldCard.findUnique({ where: { id: payment.cardId } }) : null;
    if (existingCard && payment.status === "PAID") return { accepted: true, state: "paid", cardSerial: existingCard.serial };
    if (payment.status === "REFUNDED") throw new ApiError(409, "PAYMENT_REVERSED", "This payment was reversed.");

    if (payment.status === "REQUIRES_REVIEW") {
      return { accepted: true, state: "review" };
    }
    const now = new Date();
    if (!payment.targetAgentProfileId) {
      if (!payment.payerAgencyId) {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: "REQUIRES_REVIEW", verifiedAt: now, providerPayload: Object.fromEntries(fields.entries()), failureReason: "missing_card_recipient" },
        });
        await appendAuditEvent(tx, { actorUserId: payment.userId, action: "payment.requires_review", entityType: "Payment", entityId: paymentId, payload: { reason: "missing_card_recipient" } });
        return { accepted: true, state: "review" };
      }
      const updated = await tx.payment.updateMany({
        where: { id: paymentId, status: { notIn: ["PAID", "REFUNDED", "REQUIRES_REVIEW"] } },
        data: { status: "PAID", paidAt: now, verifiedAt: now, providerPayload: Object.fromEntries(fields.entries()) },
      });
      if (!updated.count) return { accepted: true, state: "review" };
      const card = await tx.goldCard.create({
        data: { serial: `PCZ-${now.getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`, status: "MINTED", planId: payment.planId, durationDaysSnapshot: payment.termDays, agencyId: payment.payerAgencyId, issuedByUserId: payment.userId },
      });
      await tx.payment.update({ where: { id: paymentId }, data: { cardId: card.id } });
      await appendAuditEvent(tx, {
        actorUserId: payment.userId, agencyId: payment.payerAgencyId, action: "card.agency_inventory_paid",
        entityType: "GoldCard", entityId: card.id,
        payload: { serial: card.serial, paymentId, payerAgencyId: payment.payerAgencyId, state: "MINTED" },
      });
      await enqueueOutbox(tx, {
        topic: "email.send", aggregateType: "Payment", aggregateId: payment.id,
        payload: { to: payment.user.email, subject: "Agency card inventory payment received", text: "Payment was verified. The unassigned Gold Card " + card.serial + " is now in your agency inventory." },
      });
      return { accepted: true, state: "paid", cardSerial: card.serial };
    }

    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AgentProfile" WHERE "id" = ${payment.targetAgentProfileId} FOR UPDATE`);
    const profile = await tx.agentProfile.findUnique({ where: { id: payment.targetAgentProfileId }, include: { agency: true, user: true } });
    if (!profile || profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE" || profile.user.isSuspended || !profile.user.emailVerified) {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "REQUIRES_REVIEW", verifiedAt: now, providerPayload: Object.fromEntries(fields.entries()), failureReason: "card_recipient_inactive" },
      });
      await appendAuditEvent(tx, { actorUserId: payment.userId, agencyId: payment.payerAgencyId ?? profile?.agencyId, action: "payment.requires_review", entityType: "Payment", entityId: paymentId, payload: { reason: "card_recipient_inactive", targetAgentProfileId: payment.targetAgentProfileId } });
      return { accepted: true, state: "review" };
    }

    if (payment.payerAgencyId && payment.payerAgencyId !== profile.agencyId) {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "REQUIRES_REVIEW", verifiedAt: now, providerPayload: Object.fromEntries(fields.entries()), failureReason: "card_recipient_agency_changed" },
      });
      await appendAuditEvent(tx, { actorUserId: payment.userId, agencyId: payment.payerAgencyId, action: "payment.requires_review", entityType: "Payment", entityId: paymentId, payload: { reason: "card_recipient_agency_changed", targetAgentProfileId: profile.id } });
      return { accepted: true, state: "review" };
    }

    await expireAgentCards(tx, profile.id, now, payment.userId);
    const assigned = await tx.goldCard.findFirst({ where: { agentProfileId: profile.id, status: { in: ["ASSIGNED", "SUSPENDED"] } } });
    if (assigned) {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "REQUIRES_REVIEW", verifiedAt: now, providerPayload: Object.fromEntries(fields.entries()), failureReason: assigned.status === "SUSPENDED" ? "card_recipient_suspended" : "card_activation_pending" },
      });
      await appendAuditEvent(tx, { actorUserId: payment.userId, agencyId: profile.agencyId, action: "payment.requires_review", entityType: "Payment", entityId: paymentId, payload: { reason: assigned.status === "SUSPENDED" ? "card_recipient_suspended" : "card_activation_pending", targetAgentProfileId: profile.id } });
      return { accepted: true, state: "review" };
    }

    const current = await tx.goldCard.findFirst({
      where: { agentProfileId: profile.id, status: { in: ["ACTIVE", "EXPIRED"] } },
      orderBy: { createdAt: "desc" },
    });
    const startsAt = current?.expiresAt && current.expiresAt > now ? current.expiresAt : now;
    const endsAt = new Date(startsAt.getTime() + payment.termDays * 86_400_000);
    const paid = await tx.payment.updateMany({
      where: { id: paymentId, status: { notIn: ["PAID", "REFUNDED", "REQUIRES_REVIEW"] } },
      data: { status: "PAID", paidAt: now, verifiedAt: now, providerPayload: Object.fromEntries(fields.entries()) },
    });
    if (!paid.count) {
      const saved = await tx.payment.findUnique({ where: { id: paymentId }, include: { card: true } });
      return { accepted: true, state: saved?.status === "PAID" ? "paid" : "review", cardSerial: saved?.card?.serial };
    }
    const card = current
      ? await tx.goldCard.update({
          where: { id: current.id },
          data: { status: "ACTIVE", planId: payment.planId, durationDaysSnapshot: payment.termDays, ownerUserId: profile.userId, agencyId: profile.agencyId, activatedAt: current.activatedAt ?? now, expiresAt: endsAt },
        })
      : await tx.goldCard.create({
          data: {
            serial: `PCZ-${now.getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`,
            status: "ACTIVE", planId: payment.planId, durationDaysSnapshot: payment.termDays, ownerUserId: profile.userId,
            agentProfileId: profile.id, agencyId: profile.agencyId, activatedAt: now, expiresAt: endsAt,
          },
        });
    await tx.payment.update({ where: { id: paymentId }, data: { cardId: card.id } });
    await tx.cardTerm.create({ data: { cardId: card.id, paymentId, source: "PAYMENT", durationDays: payment.termDays, startsAt, endsAt } });
    await appendAuditEvent(tx, {
      actorUserId: payment.userId, agencyId: profile.agencyId,
      action: current ? "card.renewed_after_payment" : "card.activated_after_payment",
      entityType: "GoldCard",
      entityId: card.id,
      payload: { serial: card.serial, paymentId, startsAt: startsAt.toISOString(), expiresAt: endsAt.toISOString(), payerAgencyId: payment.payerAgencyId },
    });
    await enqueueOutbox(tx, {
      topic: "email.send",
      aggregateType: "GoldCard",
      aggregateId: card.id,
      payload: {
        to: profile.user.email,
        subject: current ? "Your Property Connect Gold Card was renewed" : "Your Property Connect Gold Card is active",
        text: `Your digital Gold Card ${card.serial} is active until ${endsAt.toISOString()}. Sign in to view your card.`,
      },
    });
    if (payment.payerAgencyId && payment.user.email !== profile.user.email) {
      await enqueueOutbox(tx, {
        topic: "email.send", aggregateType: "Payment", aggregateId: payment.id,
        payload: { to: payment.user.email, subject: "Agency card payment received", text: "Payment for " + profile.fullName + "'s Gold Card was verified." },
      });
    }
    return { accepted: true, state: "paid", cardSerial: card.serial };
  }, { isolationLevel: "Serializable" });
}

async function updateFailedPayment(paymentId: string, status: string, fields: URLSearchParams) {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { card: true } });
    if (!payment) return;
    const mapped = status === "cancelled" ? "CANCELLED" : status === "refunded" ? "REFUNDED" : status === "disputed" ? "REQUIRES_REVIEW" : "FAILED";
    const update = await tx.payment.updateMany({
      where: status === "refunded"
        ? { id: paymentId, status: { not: "REFUNDED" } }
        : status === "disputed"
          ? { id: paymentId, status: { notIn: ["REFUNDED", "REQUIRES_REVIEW"] } }
          : { id: paymentId, status: { notIn: ["PAID", "REFUNDED", "REQUIRES_REVIEW"] } },
      data: {
        status: mapped,
        providerPayload: Object.fromEntries(fields.entries()),
        ...(status === "disputed" ? { failureReason: "provider_disputed" } : {}),
      },
    });
    if (update.count && status === "refunded" && payment.card) {
      await revokeRefundedPaymentTerm(tx, { paymentId, cardId: payment.card.id, actorUserId: payment.userId });
    }
    if (update.count) {
      await appendAuditEvent(tx, {
        action: `payment.${status}`,
        entityType: "Payment",
        entityId: paymentId,
        payload: { providerStatus: status },
      });
    }
  });
}

async function markPaymentForReview(paymentId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: paymentId, status: { notIn: ["PAID", "REFUNDED"] } },
      data: { status: "REQUIRES_REVIEW", failureReason: reason },
    });
    if (!updated.count) return;
    await appendAuditEvent(tx, {
      action: "payment.requires_review",
      entityType: "Payment",
      entityId: paymentId,
      payload: { reason },
    });
  });
}

export async function reconcilePaynowPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !payment.pollUrl || ["PAID", "FAILED", "CANCELLED", "REFUNDED", "REQUIRES_REVIEW"].includes(payment.status)) return;
  const fields = await pollPaynow(payment.pollUrl);
  const result = await receivePaynowResult(fields);
  if (["ok", "message", "created", "sent", "delivered", "pending", "processing", "awaiting payment", "awaiting delivery"].includes(result.state ?? "")) {
    await prisma.$transaction(async (tx) => {
      const outbox = await enqueueOutbox(tx, {
        topic: "payment.reconcile", aggregateType: "Payment", aggregateId: payment.id, payload: { paymentId: payment.id },
      });
      await tx.outboxMessage.update({
        where: { id: outbox.id }, data: { availableAt: new Date(Date.now() + 60_000) },
      });
    });
  }
}

