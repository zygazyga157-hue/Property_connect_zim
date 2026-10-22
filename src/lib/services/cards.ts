import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { appendAuditEvent } from "@/lib/audit/chain";
import { enqueueOutbox } from "@/lib/outbox";
import { PAGE_SIZES, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";
import { activationCodeMatches, hashActivationCode } from "@/lib/card-codes";
import type { CurrentUser } from "@/lib/authz";
import type { z } from "zod";
import type { adminCardActionSchema, cardPlanSchema, mintCardSchema } from "@/lib/schemas";

type PlanInput = z.infer<typeof cardPlanSchema>;
type MintInput = z.infer<typeof mintCardSchema>;
type AdminCardAction = z.infer<typeof adminCardActionSchema>;
type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;
const cardActionSelect = {
  id: true, serial: true, status: true, agentProfileId: true, agencyId: true, ownerUserId: true, expiresAt: true,
} as const;

function makeActivationCode() {
  return randomBytes(8).toString("hex").toUpperCase();
}

function makeSerial() {
  return "PCZ-" + new Date().getUTCFullYear() + "-" + randomBytes(4).toString("hex").toUpperCase();
}

async function lockAgent(tx: Tx, agentProfileId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AgentProfile" WHERE "id" = ${agentProfileId} FOR UPDATE`);
}

async function lockCard(tx: Tx, serial: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "GoldCard" WHERE "serial" = ${serial} FOR UPDATE`);
}

async function releaseExpiredCardLocks(tx: Tx, agentProfileId: string, now = new Date()) {
  await expireAgentCards(tx, agentProfileId, now);
}

export async function expireAgentCards(tx: Tx, agentProfileId: string, now = new Date(), actorUserId?: string | null) {
  const expired = await tx.goldCard.findMany({
    where: { agentProfileId, status: "ACTIVE", expiresAt: { lte: now } },
    select: { id: true, serial: true, agencyId: true, expiresAt: true },
  });
  for (const card of expired) {
    const update = await tx.goldCard.updateMany({ where: { id: card.id, status: "ACTIVE", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
    if (!update.count) continue;
    await appendAuditEvent(tx, {
      actorUserId, agencyId: card.agencyId, action: "card.expired", entityType: "GoldCard", entityId: card.id,
      payload: { serial: card.serial, expiresAt: card.expiresAt?.toISOString() ?? null },
    });
  }
}

async function ensureAgentHasNoCurrentCard(tx: Tx, agentProfileId: string, excludingCardId?: string) {
  await lockAgent(tx, agentProfileId);
  await releaseExpiredCardLocks(tx, agentProfileId);
  const existing = await tx.goldCard.findFirst({
    where: {
      agentProfileId,
      id: excludingCardId ? { not: excludingCardId } : undefined,
      status: { in: ["ASSIGNED", "ACTIVE", "SUSPENDED"] },
    },
    select: { serial: true, status: true },
  });
  if (existing) {
    throw new ApiError(409, "AGENT_CARD_EXISTS", "This agent already has a current Gold Card. Resolve that card before assigning another.");
  }
}

export async function listCardPlans(includeDrafts = false) {
  return prisma.cardPlan.findMany({
    where: includeDrafts ? undefined : { status: "ACTIVE" },
    orderBy: { durationDays: "asc" },
    select: { id: true, code: true, name: true, description: true, durationDays: true, priceAmount: true, currency: true, priceApproved: true, status: true },
  });
}

export async function saveCardPlan(actorUserId: string, id: string | undefined, input: PlanInput) {
  return prisma.$transaction(async (tx) => {
    const plan = id
      ? await tx.cardPlan.update({
          where: { id },
          data: { code: input.code, name: input.name, description: input.description, durationDays: input.durationDays, priceAmount: input.priceAmount, currency: input.currency, priceApproved: input.priceApproved, status: input.status },
        })
      : await tx.cardPlan.create({
          data: { code: input.code, name: input.name, description: input.description, durationDays: input.durationDays, priceAmount: input.priceAmount, currency: input.currency, priceApproved: input.priceApproved, status: input.status },
        });
    await appendAuditEvent(tx, {
      actorUserId, action: id ? "card_plan.updated" : "card_plan.created",
      entityType: "CardPlan", entityId: plan.id,
      payload: {
        code: plan.code, durationDays: plan.durationDays, priceAmount: plan.priceAmount?.toString() ?? null,
        currency: plan.currency, priceApproved: plan.priceApproved, status: plan.status,
      },
    });
    return plan;
  });
}

export async function mintAdminCard(actorUserId: string, input: MintInput) {
  const plan = await prisma.cardPlan.findUnique({ where: { code: input.planCode } });
  if (!plan || plan.status !== "ACTIVE") throw new ApiError(404, "PLAN_NOT_FOUND", "Choose an active card plan.");
  const profile = input.agentProfileId
    ? await prisma.agentProfile.findUnique({ where: { id: input.agentProfileId }, include: { agency: true, user: { select: { name: true, emailVerified: true, isSuspended: true } } } })
    : null;
  if (input.agentProfileId && (!profile || profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE" || !profile.user.emailVerified || profile.user.isSuspended)) {
    throw new ApiError(409, "AGENT_NOT_ACTIVE", "Only an agent in an active agency can receive an assigned card.");
  }
  if (input.agencyId && !profile) {
    const agency = await prisma.agency.findUnique({ where: { id: input.agencyId }, select: { id: true, status: true } });
    if (!agency || agency.status !== "ACTIVE") throw new ApiError(409, "AGENCY_NOT_ACTIVE", "Choose an active agency for its card inventory.");
  }
  if (profile && input.agencyId && profile.agencyId !== input.agencyId) {
    throw new ApiError(400, "CARD_AGENCY_MISMATCH", "The selected agent does not belong to the selected agency.");
  }
  const activationCode = profile ? makeActivationCode() : null;
  const card = await prisma.$transaction(async (tx) => {
    let targetProfile = input.agentProfileId
      ? await tx.agentProfile.findUnique({ where: { id: input.agentProfileId }, include: { agency: true, user: { select: { emailVerified: true, isSuspended: true } } } })
      : null;
    if (input.agentProfileId && (!targetProfile || targetProfile.status !== "ACTIVE" || targetProfile.agency.status !== "ACTIVE" || !targetProfile.user.emailVerified || targetProfile.user.isSuspended)) {
      throw new ApiError(409, "AGENT_NOT_ACTIVE", "Only an active, verified agent in an active agency can receive an assigned card.");
    }
    if (targetProfile && input.agencyId && targetProfile.agencyId !== input.agencyId) {
      throw new ApiError(400, "CARD_AGENCY_MISMATCH", "The selected agent does not belong to the selected agency.");
    }
    if (!targetProfile && input.agencyId) {
      const agency = await tx.agency.findUnique({ where: { id: input.agencyId }, select: { id: true, status: true } });
      if (!agency || agency.status !== "ACTIVE") throw new ApiError(409, "AGENCY_NOT_ACTIVE", "Choose an active agency for its card inventory.");
    }
    if (targetProfile) {
      await lockAgent(tx, targetProfile.id);
      targetProfile = await tx.agentProfile.findUnique({ where: { id: input.agentProfileId! }, include: { agency: true, user: { select: { emailVerified: true, isSuspended: true } } } });
      if (!targetProfile || targetProfile.status !== "ACTIVE" || targetProfile.agency.status !== "ACTIVE" || !targetProfile.user.emailVerified || targetProfile.user.isSuspended) {
        throw new ApiError(409, "AGENT_NOT_ACTIVE", "Only an active, verified agent in an active agency can receive an assigned card.");
      }
      if (input.agencyId && targetProfile.agencyId !== input.agencyId) {
        throw new ApiError(400, "CARD_AGENCY_MISMATCH", "The selected agent does not belong to the selected agency.");
      }
      await ensureAgentHasNoCurrentCard(tx, targetProfile.id);
    }
    const ownerUserId = targetProfile?.userId;
    const agencyId = targetProfile?.agencyId ?? input.agencyId;
    const created = await tx.goldCard.create({
      data: {
        serial: makeSerial(), activationCodeHash: activationCode ? hashActivationCode(activationCode) : null, planId: plan.id,
        durationDaysSnapshot: plan.durationDays,
        ownerUserId, agentProfileId: targetProfile?.id, agencyId, issuedByUserId: actorUserId,
        status: targetProfile ? "ASSIGNED" : "MINTED",
      },
      select: { id: true, serial: true, status: true, createdAt: true },
    });
    await appendAuditEvent(tx, {
      actorUserId, agencyId, action: "card.admin_minted", entityType: "GoldCard", entityId: created.id,
      payload: { serial: created.serial, planCode: plan.code, ownerUserId: ownerUserId ?? null, agentProfileId: targetProfile?.id ?? null, reason: input.reason },
    });
    return created;
  }, { isolationLevel: "Serializable" });
  return { card, activationCode };
}

export async function activateAdminCard(user: CurrentUser, serial: string, code: string) {
  const profileRef = await prisma.agentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!profileRef) {
    throw new ApiError(403, "AGENT_PENDING", "Your approved agent account is required to activate a Gold Card.");
  }
  const result = await prisma.$transaction(async (tx) => {
    await lockAgent(tx, profileRef.id);
    const profile = await tx.agentProfile.findUnique({
      where: { id: profileRef.id },
      include: { agency: true, user: { select: { emailVerified: true, isSuspended: true } } },
    });
    if (!profile || profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE" || !profile.user.emailVerified || profile.user.isSuspended) {
      throw new ApiError(403, "AGENT_PENDING", "Your approved agent account is required to activate a Gold Card.");
    }
    await lockCard(tx, serial);
    const card = await tx.goldCard.findUnique({ where: { serial }, include: { plan: true } });
    if (!card) throw new ApiError(404, "CARD_NOT_FOUND", "This serial could not be found.");
    const now = new Date();
    if (card.status === "ACTIVE" && card.expiresAt && card.expiresAt > now) {
      if (card.ownerUserId === user.id && card.agentProfileId === profile.id) return { state: "already_active", serial: card.serial, expiresAt: card.expiresAt };
      throw new ApiError(409, "CARD_ALREADY_CLAIMED", "This card has already been activated.");
    }
    if (card.status === "SUSPENDED") throw new ApiError(409, "CARD_SUSPENDED", "This card is suspended. Contact platform support for help.");
    const storedCodeHash = card.activationCodeHash;
    if (!(card.status === "MINTED" || card.status === "ASSIGNED") || !storedCodeHash) {
      throw new ApiError(409, "CARD_NOT_ACTIVATABLE", "This card is not available for activation.");
    }
    if (card.activationLockedUntil && card.activationLockedUntil > now) throw new ApiError(429, "CARD_LOCKED", "Too many attempts. Try again in 1 hour.");
    if (card.ownerUserId && card.ownerUserId !== user.id) throw new ApiError(403, "CARD_ASSIGNED_TO_ANOTHER_USER", "This card is assigned to another account.");
    if (card.agentProfileId && card.agentProfileId !== profile.id) throw new ApiError(403, "CARD_ASSIGNED_TO_ANOTHER_AGENT", "This card is assigned to another agent.");
    if (card.agencyId && card.agencyId !== profile.agencyId) throw new ApiError(403, "CARD_AGENCY_MISMATCH", "This card belongs to another agency.");
    if (!activationCodeMatches(code, storedCodeHash)) {
      const attempts = card.activationAttempts + 1;
      const locked = attempts >= 5;
      await tx.goldCard.update({
        where: { id: card.id },
        data: { activationAttempts: attempts, ...(locked ? { activationLockedUntil: new Date(Date.now() + 60 * 60 * 1000) } : {}) },
      });
      await appendAuditEvent(tx, {
        actorUserId: user.id, agencyId: profile.agencyId, action: "card.activation_code_rejected",
        entityType: "GoldCard", entityId: card.id, payload: { serial, attempts, locked },
      });
      return {
        error: locked ? "CARD_LOCKED" : "INVALID_ACTIVATION_CODE",
        status: locked ? 423 : 400,
        message: locked ? "Too many attempts. Try again in 1 hour." : "That code didn't match. " + Math.max(0, 4 - attempts) + " attempts left.",
      };
    }
    await ensureAgentHasNoCurrentCard(tx, profile.id, card.id);
    const inventoryPayment = await tx.payment.findFirst({ where: { cardId: card.id, status: "PAID", term: null }, orderBy: { paidAt: "asc" } });
    const durationDays = inventoryPayment?.termDays ?? card.durationDaysSnapshot;
    const expiresAt = new Date(now.getTime() + durationDays * DAY);
    const updated = await tx.goldCard.updateMany({
      where: { id: card.id, status: card.status, activationCodeHash: storedCodeHash },
      data: {
        status: "ACTIVE", ownerUserId: user.id, agentProfileId: profile.id, agencyId: profile.agencyId,
        activatedAt: card.activatedAt ?? now, expiresAt, durationDaysSnapshot: durationDays, activationCodeHash: null,
        activationAttempts: 0, activationLockedUntil: null,
      },
    });
    if (!updated.count) throw new ApiError(409, "CARD_ALREADY_CLAIMED", "This card has already been activated.");
    await tx.cardTerm.create({
      data: {
        cardId: card.id, paymentId: inventoryPayment?.id, source: inventoryPayment ? "PAYMENT" : "ADMIN_MINT",
        durationDays, startsAt: now, endsAt: expiresAt,
      },
    });
    await appendAuditEvent(tx, {
      actorUserId: user.id, agencyId: profile.agencyId, action: "card.admin_minted_card_activated",
      entityType: "GoldCard", entityId: card.id, payload: { serial, expiresAt: expiresAt.toISOString() },
    });
    await enqueueOutbox(tx, {
      topic: "email.send", aggregateType: "GoldCard", aggregateId: card.id,
      payload: { to: user.email, subject: "Your Property Connect Gold Card is active", text: "Your digital Gold Card " + serial + " is active until " + expiresAt.toISOString() + "." },
    });
    return { state: "sealed", serial, expiresAt };
  }, { isolationLevel: "Serializable" });
  if ("error" in result && typeof result.error === "string") throw new ApiError(result.status ?? 400, result.error, result.message);
  return result;
}

export async function assignAgencyCard(input: {
  actorUserId: string; agencyId: string; serial: string; agentProfileId: string; reason: string;
}) {
  const activationCode = makeActivationCode();
  const card = await prisma.$transaction(async (tx) => {
    let profile = await tx.agentProfile.findUnique({ where: { id: input.agentProfileId }, include: { agency: true, user: { select: { emailVerified: true, isSuspended: true } } } });
    if (!profile || profile.agencyId !== input.agencyId || profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE" || !profile.user.emailVerified || profile.user.isSuspended) {
      throw new ApiError(409, "AGENT_NOT_ACTIVE", "Choose an active agent in this agency.");
    }
    await lockAgent(tx, profile.id);
    profile = await tx.agentProfile.findUnique({ where: { id: input.agentProfileId }, include: { agency: true, user: { select: { emailVerified: true, isSuspended: true } } } });
    if (!profile || profile.agencyId !== input.agencyId || profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE" || !profile.user.emailVerified || profile.user.isSuspended) {
      throw new ApiError(409, "AGENT_NOT_ACTIVE", "Choose an active agent in this agency.");
    }
    await lockCard(tx, input.serial);
    const record = await tx.goldCard.findUnique({ where: { serial: input.serial } });
    if (!record || record.agencyId !== input.agencyId) throw new ApiError(404, "NOT_FOUND", "The card was not found in this agency.");
    if (record.status !== "MINTED" && record.status !== "ASSIGNED") {
      throw new ApiError(409, "CARD_NOT_ASSIGNABLE", "Only unactivated inventory cards can be assigned or reassigned.");
    }
    await ensureAgentHasNoCurrentCard(tx, profile.id, record.id);
    const updated = await tx.goldCard.update({
      where: { id: record.id },
      data: {
        status: "ASSIGNED", ownerUserId: profile.userId, agentProfileId: profile.id, agencyId: profile.agencyId,
        activationCodeHash: hashActivationCode(activationCode), activationAttempts: 0, activationLockedUntil: null,
      },
      select: { id: true, serial: true, status: true, agentProfileId: true },
    });
    await appendAuditEvent(tx, {
      actorUserId: input.actorUserId, agencyId: input.agencyId, action: "card.agency_assigned",
      entityType: "GoldCard", entityId: record.id,
      payload: { serial: input.serial, agentProfileId: profile.id, reason: input.reason, previousAgentProfileId: record.agentProfileId },
    });
    return updated;
  }, { isolationLevel: "Serializable" });
  return { card, activationCode };
}

export async function adminCardAction(actorUserId: string, serial: string, action: AdminCardAction) {
  const result = await prisma.$transaction(async (tx) => {
    let assignedProfile = action.action === "assign"
      ? await tx.agentProfile.findUnique({ where: { id: action.agentProfileId }, include: { agency: true, user: { select: { emailVerified: true, isSuspended: true } } } })
      : null;
    if (action.action === "assign") {
      if (!assignedProfile || assignedProfile.status !== "ACTIVE" || assignedProfile.agency.status !== "ACTIVE" || !assignedProfile.user.emailVerified || assignedProfile.user.isSuspended) {
        throw new ApiError(409, "AGENT_NOT_ACTIVE", "Choose an active, verified agent in an active agency.");
      }
      await lockAgent(tx, assignedProfile.id);
      assignedProfile = await tx.agentProfile.findUnique({ where: { id: action.agentProfileId }, include: { agency: true, user: { select: { emailVerified: true, isSuspended: true } } } });
      if (!assignedProfile || assignedProfile.status !== "ACTIVE" || assignedProfile.agency.status !== "ACTIVE" || !assignedProfile.user.emailVerified || assignedProfile.user.isSuspended) {
        throw new ApiError(409, "AGENT_NOT_ACTIVE", "Choose an active, verified agent in an active agency.");
      }
    }
    await lockCard(tx, serial);
    const card = await tx.goldCard.findUnique({ where: { serial }, include: { owner: { select: { email: true } } } });
    if (!card) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
    const now = new Date();

    if (action.action === "assign") {
      if (card.status !== "MINTED" && card.status !== "ASSIGNED") throw new ApiError(409, "CARD_NOT_ASSIGNABLE", "Only unactivated inventory cards can be assigned or reassigned.");
      const profile = assignedProfile!;
      await ensureAgentHasNoCurrentCard(tx, profile.id, card.id);
      const activationCode = makeActivationCode();
      const updated = await tx.goldCard.update({
        where: { id: card.id },
        data: {
          status: "ASSIGNED", ownerUserId: profile.userId, agentProfileId: profile.id, agencyId: profile.agencyId,
          activationCodeHash: hashActivationCode(activationCode), activationAttempts: 0, activationLockedUntil: null,
        },
        select: cardActionSelect,
      });
      await appendAuditEvent(tx, {
        actorUserId, agencyId: profile.agencyId, action: "card.admin_assigned", entityType: "GoldCard", entityId: card.id,
        payload: { serial, agentProfileId: profile.id, reason: action.reason, previousAgentProfileId: card.agentProfileId },
      });
      return { card: updated, activationCode };
    }

    if (action.action === "rotate_activation_code") {
      if (card.status !== "ASSIGNED") throw new ApiError(409, "CARD_NOT_CODE_RESETTABLE", "Assign this card to an agent before replacing its activation code.");
      const activationCode = makeActivationCode();
      const updated = await tx.goldCard.update({ where: { id: card.id }, data: { activationCodeHash: hashActivationCode(activationCode), activationAttempts: 0, activationLockedUntil: null }, select: cardActionSelect });
      await appendAuditEvent(tx, { actorUserId, agencyId: card.agencyId, action: "card.activation_code_reissued", entityType: "GoldCard", entityId: card.id, payload: { serial, reason: action.reason } });
      return { card: updated, activationCode };
    }

    if (action.action === "suspend") {
      if (card.status !== "ACTIVE" || !card.expiresAt || card.expiresAt <= now) throw new ApiError(409, "CARD_NOT_SUSPENDABLE", "Only an active, unexpired card can be suspended.");
      const updated = await tx.goldCard.update({ where: { id: card.id }, data: { status: "SUSPENDED", suspendedAt: now }, select: cardActionSelect });
      await appendAuditEvent(tx, { actorUserId, agencyId: card.agencyId, action: "card.suspended", entityType: "GoldCard", entityId: card.id, payload: { serial, reason: action.reason, expiresAt: card.expiresAt.toISOString() } });
      if (card.owner?.email) await enqueueOutbox(tx, { topic: "email.send", aggregateType: "GoldCard", aggregateId: card.id, payload: { to: card.owner.email, subject: "Your Property Connect Gold Card was suspended", text: "Your Gold Card " + serial + " has been suspended. Contact platform support for next steps." } });
      return { card: updated };
    }

    if (action.action === "restore") {
      if (card.status !== "SUSPENDED" || !card.suspendedAt || !card.expiresAt) throw new ApiError(409, "CARD_NOT_RESTORABLE", "This card is not currently suspended.");
      const pausedDuration = Math.max(0, now.getTime() - card.suspendedAt.getTime());
      const terms = await tx.cardTerm.findMany({ where: { cardId: card.id, status: "ACTIVE", endsAt: { gt: card.suspendedAt } } });
      for (const term of terms) {
        await tx.cardTerm.update({
          where: { id: term.id },
          data: {
            ...(term.startsAt >= card.suspendedAt ? { startsAt: new Date(term.startsAt.getTime() + pausedDuration) } : {}),
            endsAt: new Date(term.endsAt.getTime() + pausedDuration),
          },
        });
      }
      const updated = await tx.goldCard.update({
        where: { id: card.id },
        data: { status: "ACTIVE", suspendedAt: null, expiresAt: new Date(card.expiresAt.getTime() + pausedDuration) },
        select: cardActionSelect,
      });
      await appendAuditEvent(tx, { actorUserId, agencyId: card.agencyId, action: "card.restored", entityType: "GoldCard", entityId: card.id, payload: { serial, reason: action.reason, pausedMilliseconds: pausedDuration, expiresAt: updated.expiresAt?.toISOString() } });
      if (card.owner?.email) await enqueueOutbox(tx, { topic: "email.send", aggregateType: "GoldCard", aggregateId: card.id, payload: { to: card.owner.email, subject: "Your Property Connect Gold Card was restored", text: "Your Gold Card " + serial + " has been restored and is active until " + updated.expiresAt?.toISOString() + "." } });
      return { card: updated };
    }

    if (action.action === "revoke") {
      if (card.status === "REVOKED") throw new ApiError(409, "CARD_ALREADY_REVOKED", "This card has already been revoked.");
      const updated = await tx.goldCard.update({ where: { id: card.id }, data: { status: "REVOKED", revokedAt: now, suspendedAt: null }, select: cardActionSelect });
      await appendAuditEvent(tx, { actorUserId, agencyId: card.agencyId, action: "card.revoked", entityType: "GoldCard", entityId: card.id, payload: { serial, reason: action.reason, previousStatus: card.status } });
      if (card.owner?.email) await enqueueOutbox(tx, { topic: "email.send", aggregateType: "GoldCard", aggregateId: card.id, payload: { to: card.owner.email, subject: "Your Property Connect Gold Card was revoked", text: "Your Gold Card " + serial + " has been revoked. Contact platform support if you need assistance." } });
      return { card: updated };
    }

    throw new ApiError(400, "INVALID_CARD_ACTION", "Choose a supported card action.");
  }, { isolationLevel: "Serializable" });
  return result;
}

export async function listAgencyCards(user: CurrentUser, params = new URLSearchParams()) {
  const memberships = await prisma.agencyMembership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { agencyId: true, role: true, agency: { select: { name: true, status: true } } },
  });
  const ids = memberships.map((membership) => membership.agencyId);
  if (!ids.length) throw new ApiError(403, "AGENCY_ACCESS_REQUIRED", "An active agency membership is required.");
  const status = params.get("status");
  const q = params.get("q")?.trim();
  const now = new Date();
  const statusWhere: Prisma.GoldCardWhereInput = status === "EXPIRED" ? { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", expiresAt: { lte: now } }] }
    : status === "ACTIVE" ? { status: "ACTIVE", expiresAt: { gt: now } }
      : status && ["MINTED", "ASSIGNED", "SUSPENDED", "REVOKED"].includes(status) ? { status: status as "MINTED" | "ASSIGNED" | "SUSPENDED" | "REVOKED" } : {};
  const where: Prisma.GoldCardWhereInput = { AND: [{ agencyId: { in: ids } }, statusWhere, ...(q ? [{ OR: [{ serial: { contains: q, mode: "insensitive" as const } }, { agentProfile: { fullName: { contains: q, mode: "insensitive" as const } } }] }] : [])] };
  const totalItems = await prisma.goldCard.count({ where });
  const window = paginationWindow(totalItems, PAGE_SIZES.workspace, requestedPage(params));
  const cards = await prisma.goldCard.findMany({
    where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize,
    include: {
      plan: { select: { name: true, durationDays: true } },
      agentProfile: { select: { id: true, fullName: true, eacRegistrationNumber: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, status: true, amount: true, currency: true, termDays: true, createdAt: true, paidAt: true } },
    },
  });
  const safeCards = cards.map((card) => Object.fromEntries(Object.entries(card).filter(([key]) => key !== "activationCodeHash")));
  return { ...paginationEnvelope(safeCards, window), agencies: memberships.map((membership) => ({ id: membership.agencyId, ...membership.agency })), canManage: memberships.some((membership) => membership.role === "AGENCY_ADMIN") };
}

export async function revokeRefundedPaymentTerm(tx: Tx, input: { paymentId: string; cardId: string; actorUserId?: string | null }) {
  const card = await tx.goldCard.findUnique({ where: { id: input.cardId }, include: { owner: { select: { email: true } }, terms: { where: { status: "ACTIVE" }, orderBy: { startsAt: "asc" } } } });
  if (!card) return;
  const term = card.terms.find((candidate) => candidate.paymentId === input.paymentId);
  if (term) await tx.cardTerm.update({ where: { id: term.id }, data: { status: "REFUNDED", refundedAt: new Date() } });

  const effectiveNow = card.suspendedAt ?? new Date();
  const remainingTerms = await tx.cardTerm.findMany({ where: { cardId: card.id, status: "ACTIVE", endsAt: { gt: effectiveNow } }, orderBy: { startsAt: "asc" } });
  let cursor = effectiveNow;
  for (const remaining of remainingTerms) {
    const days = remaining.startsAt <= effectiveNow
      ? Math.max(1, Math.ceil((remaining.endsAt.getTime() - effectiveNow.getTime()) / DAY))
      : remaining.durationDays;
    const endsAt = new Date(cursor.getTime() + days * DAY);
    await tx.cardTerm.update({ where: { id: remaining.id }, data: { startsAt: cursor, endsAt } });
    cursor = endsAt;
  }
  if (cursor <= effectiveNow) {
    await tx.goldCard.update({ where: { id: card.id }, data: { status: "REVOKED", revokedAt: new Date(), suspendedAt: null } });
    await appendAuditEvent(tx, {
      actorUserId: input.actorUserId, agencyId: card.agencyId, action: "card.revoked_after_refund",
      entityType: "GoldCard", entityId: card.id, payload: { serial: card.serial, paymentId: input.paymentId, reason: "No paid card terms remain." },
    });
    if (card.owner?.email) await enqueueOutbox(tx, { topic: "email.send", aggregateType: "GoldCard", aggregateId: card.id, payload: { to: card.owner.email, subject: "Your Property Connect Gold Card was revoked", text: "A refunded payment left no paid card coverage. Your Gold Card " + card.serial + " has been revoked." } });
  } else {
    await tx.goldCard.update({ where: { id: card.id }, data: { expiresAt: cursor } });
    await appendAuditEvent(tx, {
      actorUserId: input.actorUserId, agencyId: card.agencyId, action: "card.coverage_recalculated_after_refund",
      entityType: "GoldCard", entityId: card.id, payload: { serial: card.serial, paymentId: input.paymentId, expiresAt: cursor.toISOString() },
    });
    if (card.owner?.email) await enqueueOutbox(tx, { topic: "email.send", aggregateType: "GoldCard", aggregateId: card.id, payload: { to: card.owner.email, subject: "Your Property Connect card coverage changed", text: "A refunded payment changed your Gold Card " + card.serial + " coverage. Its current expiry is " + cursor.toISOString() + "." } });
  }
}
