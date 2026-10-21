import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { checkoutSchema } from "@/lib/schemas";
import { createCardCheckout } from "@/lib/payments/service";

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const body = await parseJson(request, checkoutSchema);
    const result = await createCardCheckout({
      userId: user.id, email: user.email, name: user.name,
      planCode: body.planCode, idempotencyKey: body.idempotencyKey,
    });
    return jsonOk(result, { status: 201 });
  });
}
