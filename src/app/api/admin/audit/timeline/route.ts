import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";
import { PAGE_SIZES, filterDate, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const params = new URL(request.url).searchParams;
    const q = params.get("q")?.trim(); const action = params.get("action")?.trim(); const entity = params.get("entity")?.trim(); const actor = params.get("actor")?.trim();
    const from = filterDate(params.get("from")); const to = filterDate(params.get("to"), true);
    const where = {
      AND: [
        ...(q ? [{ OR: [{ action: { contains: q, mode: "insensitive" as const } }, { entityType: { contains: q, mode: "insensitive" as const } }, { entityId: { contains: q, mode: "insensitive" as const } }, { actorUserId: { contains: q, mode: "insensitive" as const } }] }] : []),
        ...(action ? [{ action: { contains: action, mode: "insensitive" as const } }] : []),
        ...(entity ? [{ OR: [{ entityType: { contains: entity, mode: "insensitive" as const } }, { entityId: { contains: entity, mode: "insensitive" as const } }] }] : []),
        ...(actor ? [{ actorUserId: { contains: actor, mode: "insensitive" as const } }] : []),
        ...(from || to ? [{ occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }] : []),
      ],
    };
    const totalItems = await prisma.auditEvent.count({ where });
    const window = paginationWindow(totalItems, PAGE_SIZES.dense, requestedPage(params));
    const events = await prisma.auditEvent.findMany({ where, orderBy: [{ sequence: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize });
    return jsonOk(paginationEnvelope(events.map((event) => ({ ...event, sequence: event.sequence.toString() })), window));
  });
}
