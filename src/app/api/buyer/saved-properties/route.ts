import { requireBuyer } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { savedPropertySchema } from "@/lib/schemas";
import { listSavedProperties, saveProperty } from "@/lib/services/buyer";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    const user = await requireBuyer(request.headers);
    return jsonOk(await listSavedProperties(user.id, new URL(request.url).searchParams));
  });
}

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireBuyer(request.headers);
    const body = await parseJson(request, savedPropertySchema);
    return jsonOk(await saveProperty(user.id, body.propertyId), { status: 201 });
  });
}
