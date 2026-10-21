import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { propertySchema } from "@/lib/schemas";
import { updateAgencyProperty } from "@/lib/services/properties";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const body = await parseJson(request, propertySchema);
    return jsonOk(await updateAgencyProperty(user, (await context.params).id, body));
  });
}
