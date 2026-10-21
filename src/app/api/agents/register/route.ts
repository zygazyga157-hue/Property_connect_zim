import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { agentRegistrationSchema } from "@/lib/schemas";
import { registerAgent } from "@/lib/services/agency";

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const body = await parseJson(request, agentRegistrationSchema);
    const profile = await registerAgent({ id: user.id, name: user.name, email: user.email }, body);
    return jsonOk(profile, { status: 201 });
  });
}
