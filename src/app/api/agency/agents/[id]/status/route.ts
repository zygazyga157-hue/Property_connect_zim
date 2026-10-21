import { requireAgencyMembership, requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { agencyAgentStatusSchema } from "@/lib/schemas";
import { reviewAgent } from "@/lib/services/agency";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const agentProfileId = (await context.params).id;
    const agent = await prisma.agentProfile.findUnique({ where: { id: agentProfileId }, select: { agencyId: true } });
    if (!agent) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
    await requireAgencyMembership(user.id, agent.agencyId, "AGENCY_ADMIN");
    const body = await parseJson(request, agencyAgentStatusSchema);
    return jsonOk(await reviewAgent({ agentProfileId, agencyId: agent.agencyId, actorUserId: user.id, ...body }));
  });
}
