import { jsonOk, withApiErrors } from "@/lib/http";
import { listPublicProperties } from "@/lib/services/properties";

export async function GET(request: Request) {
  return withApiErrors(async () => jsonOk(await listPublicProperties(new URL(request.url).searchParams)));
}
