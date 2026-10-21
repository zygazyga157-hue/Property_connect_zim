import { requireUser } from "@/lib/authz";
import { jsonOk, withApiErrors } from "@/lib/http";
import { listLeads } from "@/lib/services/properties";

export async function GET(request: Request) {
  return withApiErrors(async () => jsonOk(await listLeads(await requireUser(request.headers))));
}
