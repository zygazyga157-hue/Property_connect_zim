import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { adminCardActionSchema } from "@/lib/schemas";
import { adminCardAction } from "@/lib/services/cards";
import { PAGE_SIZES, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";
import type { Prisma } from "@/generated/prisma/client";

type Context = { params: Promise<{ serial: string }> };

export async function GET(request: Request, context: Context) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const serial = (await context.params).serial;
    const params = new URL(request.url).searchParams;
    const card = await prisma.goldCard.findUnique({
      where: { serial }, include: { plan: true, owner: { select: { id: true, name: true, email: true } }, agency: true, agentProfile: true },
    });
    if (!card) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
    const paymentQ = params.get("paymentQ")?.trim(); const paymentStatus = params.get("paymentStatus");
    const paymentWhere: Prisma.PaymentWhereInput = { cardId: card.id, ...(paymentStatus && ["INITIATED", "AWAITING_PAYMENT", "PAID", "FAILED", "CANCELLED", "REFUNDED", "REQUIRES_REVIEW"].includes(paymentStatus) ? { status: paymentStatus as "INITIATED" | "AWAITING_PAYMENT" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED" | "REQUIRES_REVIEW" } : {}), ...(paymentQ ? { OR: [{ providerReference: { contains: paymentQ, mode: "insensitive" } }, { plan: { name: { contains: paymentQ, mode: "insensitive" } } }] } : {}) };
    const termStatus = params.get("termStatus");
    const termWhere = { cardId: card.id, ...(termStatus && ["ACTIVE", "REFUNDED"].includes(termStatus) ? { status: termStatus as "ACTIVE" | "REFUNDED" } : {}) };
    const eventQ = params.get("eventQ")?.trim(); const eventWhere = { entityType: "GoldCard", entityId: card.id, ...(eventQ ? { action: { contains: eventQ, mode: "insensitive" as const } } : {}) };
    const [paymentTotal, termTotal, eventTotal] = await Promise.all([prisma.payment.count({ where: paymentWhere }), prisma.cardTerm.count({ where: termWhere }), prisma.auditEvent.count({ where: eventWhere })]);
    const paymentWindow = paginationWindow(paymentTotal, PAGE_SIZES.cardHistory, requestedPage(params, "paymentPage"));
    const termWindow = paginationWindow(termTotal, PAGE_SIZES.cardHistory, requestedPage(params, "termPage"));
    const eventWindow = paginationWindow(eventTotal, PAGE_SIZES.dense, requestedPage(params, "eventPage"));
    const [payments, terms, events] = await Promise.all([
      prisma.payment.findMany({ where: paymentWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: paymentWindow.skip, take: paymentWindow.pageSize, include: { plan: true, term: true } }),
      prisma.cardTerm.findMany({ where: termWhere, orderBy: [{ startsAt: "desc" }, { id: "desc" }], skip: termWindow.skip, take: termWindow.pageSize }),
      prisma.auditEvent.findMany({ where: eventWhere, orderBy: [{ sequence: "asc" }, { id: "asc" }], skip: eventWindow.skip, take: eventWindow.pageSize }),
    ]);
    const safeCard = Object.fromEntries(Object.entries(card).filter(([key]) => key !== "activationCodeHash"));
    return jsonOk({ card: safeCard, payments: paginationEnvelope(payments, paymentWindow), terms: paginationEnvelope(terms, termWindow), events: paginationEnvelope(events.map((event) => ({ ...event, sequence: event.sequence.toString() })), eventWindow) });
  });
}

export async function PATCH(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requirePlatformAdmin(request.headers);
    const body = await parseJson(request, adminCardActionSchema);
    const serial = (await context.params).serial;
    return jsonOk(await adminCardAction(user.id, serial, body));
  });
}
