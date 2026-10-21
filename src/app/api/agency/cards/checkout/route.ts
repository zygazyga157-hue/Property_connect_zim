import { requireUser } from "@/lib/authz";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { agencyCardCheckoutSchema } from "@/lib/schemas";
import { createCardCheckout } from "@/lib/payments/service";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const membership = await prisma.agencyMembership.findUnique({
      where: { userId: user.id }, include: { agency: true },
    });
    if (!membership || membership.status !== "ACTIVE") throw new ApiError(403, "AGENCY_ACCESS_REQUIRED", "An active agency membership is required.");
    if (membership.role !== "AGENCY_ADMIN") throw new ApiError(403, "AGENCY_ADMIN_REQUIRED", "Only an agency administrator can buy sponsored cards.");
    if (membership.agency.status !== "ACTIVE") throw new ApiError(409, "AGENCY_NOT_ACTIVE", "Sponsored card purchases require an active agency.");
    const body = await parseJson(request, agencyCardCheckoutSchema);
    const result = await createCardCheckout({
      userId: user.id, email: user.email, name: user.name,
      planCode: body.planCode, idempotencyKey: body.idempotencyKey,
      payerAgencyId: membership.agencyId, targetAgentProfileId: body.agentProfileId,
    });
    return jsonOk(result, { status: 201 });
  });
}
