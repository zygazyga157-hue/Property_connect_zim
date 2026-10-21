import { requirePlatformAdmin } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { jsonOk, withApiErrors } from "@/lib/http";

const notableActions = [
  "payment.requires_review", "card.activation_code_rejected", "card.revoked",
  "agency.suspend", "agent.suspend", "audit.chain_verification_failed",
];

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    const events = await prisma.auditEvent.findMany({
      where: { action: { in: notableActions } }, orderBy: { sequence: "desc" }, take: 200,
    });
    return jsonOk(events.map((event) => ({ ...event, sequence: event.sequence.toString() })));
  });
}
