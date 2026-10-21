import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { jsonOk, parseJson, withApiErrors } from "@/lib/http";
import { assignAgencyCardSchema } from "@/lib/schemas";
import { assignAgencyCard } from "@/lib/services/cards";

type Context = { params: Promise<{ serial: string }> };

export async function POST(request: Request, context: Context) {
  return withApiErrors(async () => {
    const user = await requireUser(request.headers);
    const membership = await prisma.agencyMembership.findUnique({ where: { userId: user.id }, include: { agency: true } });
    if (!membership || membership.status !== "ACTIVE") throw new ApiError(403, "AGENCY_ACCESS_REQUIRED", "An active agency membership is required.");
    if (membership.role !== "AGENCY_ADMIN") throw new ApiError(403, "AGENCY_ADMIN_REQUIRED", "Only an agency administrator can assign cards.");
    if (membership.agency.status !== "ACTIVE") throw new ApiError(409, "AGENCY_NOT_ACTIVE", "Cards cannot be assigned while the agency is inactive.");
    const body = await parseJson(request, assignAgencyCardSchema);
    const result = await assignAgencyCard({ actorUserId: user.id, agencyId: membership.agencyId, serial: (await context.params).serial, ...body });
    return jsonOk(result);
  });
}
