import { agencyRegistrationSchema } from "@/lib/schemas";
import { registerAgency } from "@/lib/services/agency";
import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const body = await parseJson(request, agencyRegistrationSchema);
    const agency = await registerAgency(user.id, user.name, body);
    return jsonOk(agency, { status: 201 });
  });
}
