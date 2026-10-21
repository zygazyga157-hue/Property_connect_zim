import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { invitationLookupSchema } from "@/lib/schemas";
import { enforceRateLimit, hashClientIp, requestIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  return withApiErrors(async () => {
    await enforceRateLimit("invite-verify:" + hashClientIp(requestIp(request)), 20, 60 * 60 * 1000);
    const body = await parseJson(request, invitationLookupSchema);
    const tokenHash = createHash("sha256").update(body.invitationToken).digest("hex");
    const invitation = await prisma.agentInvitation.findUnique({ where: { tokenHash }, include: { agency: { select: { name: true, status: true } } } });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date() || invitation.email.toLowerCase() !== body.email || invitation.agency.status !== "ACTIVE") {
      throw new ApiError(400, "INVITATION_INVALID", "This invitation is invalid, expired, or belongs to another email address.");
    }
    return jsonOk({ agencyName: invitation.agency.name });
  });
}
