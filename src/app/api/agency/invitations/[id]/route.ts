import { requireUser } from "@/lib/authz";
import { parseInvitationType, resolveInvitationScope } from "@/lib/agent-invitation-access";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { invitationRevokeSchema } from "@/lib/schemas";
import { revokeAgentInvitation } from "@/lib/services/agency";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const type = parseInvitationType(new URL(request.url).searchParams.get("type"));
    const scope = await resolveInvitationScope(user, type, { requireActiveCard: type === "subagent" });
    const body = await parseJson(request, invitationRevokeSchema);
    const result = await revokeAgentInvitation({
      id: (await context.params).id,
      scope,
      actorUserId: user.id,
      reason: body.reason,
    });
    return jsonOk(result);
  });
}
