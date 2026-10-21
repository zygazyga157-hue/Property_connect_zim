import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const search = new URL(request.url).searchParams;
    const after = BigInt(search.get("after") ?? "0");
    const limit = Math.min(500, Math.max(1, Number(search.get("limit") ?? 100) || 100));
    const events = await prisma.auditEvent.findMany({
      where: { sequence: { gt: after } }, orderBy: { sequence: "asc" }, take: limit,
    });
    return jsonOk(events.map((event) => ({ ...event, sequence: event.sequence.toString() })));
  });
}
