import { env } from "@/lib/env";
import { requireUser } from "@/lib/authz";
import { resolveInvitationScope, parseInvitationType } from "@/lib/agent-invitation-access";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { agentInvitationSchema } from "@/lib/schemas";
import { inviteAgent, listAgentInvitations } from "@/lib/services/agency";
import { enforceRateLimit, hashClientIp, requestIp } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const type = parseInvitationType(new URL(request.url).searchParams.get("type"));
    const scope = await resolveInvitationScope(user, type);
    return jsonOk(await listAgentInvitations(scope, new URL(request.url).searchParams));
  });
}

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    await enforceRateLimit("invite:" + hashClientIp(requestIp(request)), 20, 60 * 60 * 1000);
    const body = await parseJson(request, agentInvitationSchema);
    const existingAgent = body.invitationType ? null : await prisma.agentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    const type = body.invitationType ?? (existingAgent ? "subagent" : "agency");
    const scope = await resolveInvitationScope(user, type, { requireActiveCard: type === "subagent" });
    const result = await inviteAgent({
      agencyId: scope.agencyId,
      parentAgentId: scope.parentAgentId ?? undefined,
      actorUserId: user.id,
      email: body.email,
      expiresInDays: body.expiresInDays,
      appUrl: env.appUrl,
    });
    return jsonOk(result, { status: 201 });
  });
}
