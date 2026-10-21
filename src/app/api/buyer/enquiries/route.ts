import { requireBuyer } from "@/lib/authz";
import { jsonOk, withApiErrors } from "@/lib/http";
import { listBuyerEnquiries } from "@/lib/services/buyer";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    const user = await requireBuyer(request.headers);
    return jsonOk(await listBuyerEnquiries(user.id));
  });
}
