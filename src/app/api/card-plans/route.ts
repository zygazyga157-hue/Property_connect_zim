import { jsonOk, withApiErrors } from "@/lib/http";
import { listCardPlans } from "@/lib/services/cards";

export async function GET() {
  return withApiErrors(async () => jsonOk(await listCardPlans()));
}
