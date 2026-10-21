import { jsonOk, withApiErrors } from "@/lib/http";
import { getPublicProperty } from "@/lib/services/properties";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return withApiErrors(async () => jsonOk(await getPublicProperty((await context.params).id)));
}
