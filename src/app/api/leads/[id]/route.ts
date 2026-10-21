import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { leadUpdateSchema } from "@/lib/schemas";
import { updateLead } from "@/lib/services/properties";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const body = await parseJson(request, leadUpdateSchema);
    return jsonOk(await updateLead(user, (await context.params).id, body.status));
  });
}
