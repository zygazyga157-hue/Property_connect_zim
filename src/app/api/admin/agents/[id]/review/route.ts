import { requirePlatformAdmin } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { reviewSchema } from "@/lib/schemas";
import { reviewAgent } from "@/lib/services/agency";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requirePlatformAdmin(request.headers);
    const body = await parseJson(request, reviewSchema);
    return jsonOk(await reviewAgent({ agentProfileId: (await context.params).id, actorUserId: user.id, ...body }));
  });
}
