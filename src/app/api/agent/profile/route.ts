import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { agentProfileUpdateSchema } from "@/lib/schemas";
import { updateAgentProfile } from "@/lib/services/agency";

export async function PUT(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const body = await parseJson(request, agentProfileUpdateSchema);
    return jsonOk(await updateAgentProfile(user.id, body));
  });
}
