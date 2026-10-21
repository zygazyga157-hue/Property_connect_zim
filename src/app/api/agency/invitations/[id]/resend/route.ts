import { env } from "@/lib/env";
import { requireUser } from "@/lib/authz";
import { parseInvitationType, resolveInvitationScope } from "@/lib/agent-invitation-access";
import { jsonOk, withApiErrors } from "@/lib/http";
import { enforceRateLimit, hashClientIp, requestIp } from "@/lib/rate-limit";
import { resendAgentInvitation } from "@/lib/services/agency";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    await enforceRateLimit("invite:" + hashClientIp(requestIp(request)), 20, 60 * 60 * 1000);
    const type = parseInvitationType(new URL(request.url).searchParams.get("type"));
    const scope = await resolveInvitationScope(user, type, { requireActiveCard: type === "subagent" });
    const result = await resendAgentInvitation({
      id: (await context.params).id,
      scope,
      actorUserId: user.id,
      expiresInDays: 7,
      appUrl: env.appUrl,
    });
    return jsonOk(result, { status: 201 });
  });
}
