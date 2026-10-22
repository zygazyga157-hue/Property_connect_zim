import { requireUser } from "@/lib/authz";
import { jsonOk, withApiErrors } from "@/lib/http";
import { listAgencyCards } from "@/lib/services/cards";

export async function GET(request: Request) {
  return withApiErrors(async () => jsonOk(await listAgencyCards(await requireUser(request.headers), new URL(request.url).searchParams)));
}
