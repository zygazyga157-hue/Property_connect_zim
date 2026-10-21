import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const [agencies, agents, properties, cards, head, latestEvents] = await Promise.all([
      prisma.agency.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.agentProfile.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.property.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.goldCard.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.auditChainHead.findUnique({ where: { id: "global" } }),
      prisma.auditEvent.findMany({ orderBy: { sequence: "desc" }, take: 12 }),
    ]);
    return jsonOk({
      agencies, agents, properties, cards,
      audit: { sequence: (head?.sequence ?? 0n).toString(), lastHash: head?.lastHash ?? "" },
      latestEvents: latestEvents.map((event) => ({ ...event, sequence: event.sequence.toString() })),
    });
  });
}
