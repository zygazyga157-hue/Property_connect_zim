import { requirePlatformAdmin } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { cardPlanSchema } from "@/lib/schemas";
import { listCardPlans, saveCardPlan } from "@/lib/services/cards";

export async function GET(request: Request) {
  return withApiErrors(async () => {
    await requirePlatformAdmin(request.headers);
    return jsonOk(await listCardPlans(true));
  });
}

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requirePlatformAdmin(request.headers);
    const body = await parseJson(request, cardPlanSchema);
    if (body.priceApproved && !body.priceAmount) {
      return Response.json({ error: { code: "PRICE_REQUIRED", message: "An approved price is required before enabling sales." } }, { status: 422 });
    }
    return jsonOk(await saveCardPlan(user.id, undefined, body), { status: 201 });
  });
}
