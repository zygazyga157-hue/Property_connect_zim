import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { withApiErrors } from "@/lib/http";
import { verifyAuditChain } from "@/lib/audit/chain";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const events = await prisma.auditEvent.findMany({ orderBy: { sequence: "asc" }, take: 100_000 });
    const verification = await verifyAuditChain();
    const document = {
      exportedAt: new Date().toISOString(),
      verification: { ...verification, checked: verification.checked.toString(), failedAt: verification.failedAt?.toString() },
      events: events.map((event) => ({ ...event, sequence: event.sequence.toString() })),
    };
    return new Response(JSON.stringify(document, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": "attachment; filename=property-connect-audit.json", "cache-control": "no-store" },
    });
  });
}
