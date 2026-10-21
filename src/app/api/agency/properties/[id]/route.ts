import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { agencyPropertyStatusSchema } from "@/lib/schemas";
import { updateAgencyPropertyStatus } from "@/lib/services/properties";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const body = await parseJson(request, agencyPropertyStatusSchema);
    return jsonOk(await updateAgencyPropertyStatus(user, (await context.params).id, body.status));
  });
}
