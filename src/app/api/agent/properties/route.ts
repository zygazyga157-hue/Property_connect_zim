import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { propertySchema } from "@/lib/schemas";
import { createProperty, listManagedProperties } from "@/lib/services/properties";

export async function GET(request: Request) {
  return withApiErrors(async () => jsonOk(await listManagedProperties(await requireUser(request.headers))));
}

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const body = await parseJson(request, propertySchema);
    return jsonOk(await createProperty(user, body), { status: 201 });
  });
}
