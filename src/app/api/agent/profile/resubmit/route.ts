import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { agentResubmissionSchema } from "@/lib/schemas";
import { resubmitAgentProfile } from "@/lib/services/agency";

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const body = await parseJson(request, agentResubmissionSchema);
    return jsonOk(await resubmitAgentProfile(user.id, body));
  });
}
