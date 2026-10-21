import "server-only";

import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { requireActiveAgent, requireAgencyMembership, type CurrentUser } from "@/lib/authz";

export type InvitationType = "agency" | "subagent";
export type InvitationScope = { agencyId: string; parentAgentId: string | null };

export function parseInvitationType(value: string | null): InvitationType {
  if (value === "agency" || value === "subagent") return value;
  throw new ApiError(400, "INVITATION_TYPE_REQUIRED", "Choose whether this invitation is for an agency agent or a subagent.");
}

export async function resolveInvitationScope(
  user: CurrentUser,
  type: InvitationType,
  options: { requireActiveCard?: boolean } = {},
): Promise<InvitationScope> {
  if (type === "agency") {
    const membership = await prisma.agencyMembership.findFirst({
      where: { userId: user.id, status: "ACTIVE", role: "AGENCY_ADMIN" },
      select: { agencyId: true },
    });
    if (!membership) throw new ApiError(403, "AGENCY_ADMIN_REQUIRED", "An agency administrator account is required.");
    await requireAgencyMembership(user.id, membership.agencyId, "AGENCY_ADMIN");
    return { agencyId: membership.agencyId, parentAgentId: null };
  }

  const profile = await prisma.agentProfile.findUnique({
    where: { userId: user.id },
    include: { agency: { select: { status: true } } },
  });
  if (!profile || profile.parentAgentId || profile.status !== "ACTIVE") {
    throw new ApiError(403, "ACTIVE_LEAD_AGENT_REQUIRED", "An active lead agent profile is required to view and manage subagent invitations.");
  }
  if (options.requireActiveCard) await requireActiveAgent(user);
  return { agencyId: profile.agencyId, parentAgentId: profile.id };
}
