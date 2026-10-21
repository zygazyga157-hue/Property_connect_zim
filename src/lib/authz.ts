import "server-only";

import { auth } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/db";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

export async function requireUser(requestHeaders: Headers): Promise<CurrentUser> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.isSuspended) throw new ApiError(403, "ACCOUNT_SUSPENDED", "This account cannot access the requested service.");
  if (!user.emailVerified) throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email address before accessing your workspace.");
  return user;
}

export async function requireBuyer(requestHeaders: Headers): Promise<CurrentUser> {
  const user = await requireUser(requestHeaders);
  if (user.globalRole !== "buyer") throw new ApiError(403, "BUYER_ACCOUNT_REQUIRED", "Buyer account access is required for this personal workspace.");
  return user;
}

export async function requirePlatformAdmin(requestHeaders: Headers): Promise<CurrentUser> {
  const user = await requireUser(requestHeaders);
  if (user.globalRole !== "platform_admin") {
    throw new ApiError(403, "PLATFORM_ADMIN_REQUIRED", "This area is for platform administrators.");
  }
  if (!user.twoFactorEnabled) {
    throw new ApiError(403, "ADMIN_MFA_REQUIRED", "Enable two-factor authentication before using the Audit Hub.");
  }
  return user;
}

export async function requireAgencyMembership(
  userId: string,
  agencyId: string,
  minimumRole?: "AGENCY_ADMIN" | "AGENCY_STAFF",
) {
  const membership = await prisma.agencyMembership.findUnique({
    where: { agencyId_userId: { agencyId, userId } },
    include: { agency: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
  }
  if (minimumRole === "AGENCY_ADMIN" && membership.role !== "AGENCY_ADMIN") {
    throw new ApiError(403, "AGENCY_ADMIN_REQUIRED", "This action requires an agency administrator.");
  }
  return membership;
}

export async function requireActiveAgent(user: CurrentUser) {
  const profile = await prisma.agentProfile.findUnique({
    where: { userId: user.id },
    include: { agency: true },
  });
  if (!profile || profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE") {
    throw new ApiError(403, "AGENT_PENDING", "Your agent profile must be approved before you can publish.");
  }

  const activeCard = await prisma.goldCard.findFirst({
    where: {
      OR: [{ ownerUserId: user.id }, { agentProfileId: profile.id }],
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
    select: { id: true, serial: true, expiresAt: true },
  });
  if (!activeCard) {
    throw new ApiError(403, "ACTIVE_CARD_REQUIRED", "Renew your Gold Card to publish or update listings.");
  }
  return { profile, activeCard };
}

export async function canReadLead(user: CurrentUser, leadId: string): Promise<boolean> {
  if (user.globalRole === "platform_admin") return user.twoFactorEnabled;
  const profile = await prisma.agentProfile.findUnique({
    where: { userId: user.id },
    include: { subagents: { select: { id: true } } },
  });
  if (profile) {
    const visibleAgentIds = [profile.id, ...profile.subagents.map((agent) => agent.id)];
    const lead = await prisma.enquiry.findFirst({
      where: { id: leadId, agentProfileId: { in: visibleAgentIds } },
      select: { id: true },
    });
    return Boolean(lead);
  }
  const memberships = await prisma.agencyMembership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { agencyId: true },
  });
  const lead = await prisma.enquiry.findFirst({
    where: { id: leadId, agencyId: { in: memberships.map((membership) => membership.agencyId) } },
    select: { id: true },
  });
  return Boolean(lead);
}
