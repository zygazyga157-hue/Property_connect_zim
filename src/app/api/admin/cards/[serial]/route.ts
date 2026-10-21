import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { adminCardActionSchema } from "@/lib/schemas";
import { adminCardAction } from "@/lib/services/cards";

type Context = { params: Promise<{ serial: string }> };

export async function GET(request: Request, context: Context) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const serial = (await context.params).serial;
    const card = await prisma.goldCard.findUnique({
      where: { serial }, include: { plan: true, owner: { select: { id: true, name: true, email: true } }, agency: true, agentProfile: true, payments: { include: { plan: true, term: true }, orderBy: { createdAt: "desc" } }, terms: { orderBy: { startsAt: "asc" } } },
    });
    if (!card) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
    const events = await prisma.auditEvent.findMany({
      where: { entityType: "GoldCard", entityId: card.id }, orderBy: { sequence: "asc" },
    });
    const safeCard = Object.fromEntries(Object.entries(card).filter(([key]) => key !== "activationCodeHash"));
    return jsonOk({ card: safeCard, events: events.map((event) => ({ ...event, sequence: event.sequence.toString() })) });
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
