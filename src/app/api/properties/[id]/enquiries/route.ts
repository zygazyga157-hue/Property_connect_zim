import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { enquirySchema } from "@/lib/schemas";
import { createPublicEnquiry } from "@/lib/services/properties";
import { enforceRateLimit, hashClientIp, requestIp } from "@/lib/rate-limit";
import { requireBuyer, type CurrentUser } from "@/lib/authz";
import { ApiError } from "@/lib/errors";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return withApiErrors(async () => {
    const ip = requestIp(request);
    await enforceRateLimit("enquiry:" + hashClientIp(ip), 8, 60 * 60 * 1000);
    const body = await parseJson(request, enquirySchema);
    if (body.website) return jsonOk({ received: true }, { status: 202 });
    let buyerUser: Pick<CurrentUser, "id" | "name" | "email"> | undefined;
    try {
      const user = await requireBuyer(request.headers);
      buyerUser = { id: user.id, name: user.name, email: user.email };
    } catch (error) {
      if (!(error instanceof ApiError && [401, 403].includes(error.status))) throw error;
    }
    const result = await createPublicEnquiry({ ...body, buyerUser, propertyId: (await context.params).id, ip });
    return jsonOk({ received: true, enquiryId: result.id }, { status: 201 });
  });
}
