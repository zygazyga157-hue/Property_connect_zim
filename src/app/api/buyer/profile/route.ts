import { requireBuyer } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { buyerProfileSchema } from "@/lib/schemas";
import { getBuyerProfile, updateBuyerProfile } from "@/lib/services/buyer";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    const user = await requireBuyer(request.headers);
    return jsonOk({ user: { name: user.name, email: user.email }, preferences: await getBuyerProfile(user.id) });
  });
}

export async function PUT(request: Request) {
  return withApiErrors(async () => {
    const user = await requireBuyer(request.headers);
    const body = await parseJson(request, buyerProfileSchema);
    return jsonOk(await updateBuyerProfile(user.id, body));
  });
}
