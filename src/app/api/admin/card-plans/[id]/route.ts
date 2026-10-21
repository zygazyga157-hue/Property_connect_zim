import { requirePlatformAdmin } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { cardPlanSchema } from "@/lib/schemas";
import { saveCardPlan } from "@/lib/services/cards";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requirePlatformAdmin(request.headers);
    const body = await parseJson(request, cardPlanSchema);
    if (body.priceApproved && !body.priceAmount) {
      return Response.json({ error: { code: "PRICE_REQUIRED", message: "An approved price is required before enabling sales." } }, { status: 422 });
    }
    return jsonOk(await saveCardPlan(user.id, (await context.params).id, body));
  });
}
