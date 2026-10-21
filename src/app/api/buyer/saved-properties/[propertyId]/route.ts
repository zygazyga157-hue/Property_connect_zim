import { requireBuyer } from "@/lib/authz";
import { jsonOk, withApiErrors } from "@/lib/http";
import { isPropertySaved, removeSavedProperty } from "@/lib/services/buyer";

type Context = { params: Promise<{ propertyId: string }> };

export async function GET(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requireBuyer(request.headers);
    const { propertyId } = await context.params;
    return jsonOk({ saved: await isPropertySaved(user.id, propertyId) });
  });
}

export async function DELETE(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requireBuyer(request.headers);
    const { propertyId } = await context.params;
    return jsonOk(await removeSavedProperty(user.id, propertyId));
  });
}
