import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { appendAuditEvent } from "@/lib/audit/chain";
import { enqueueOutbox } from "@/lib/outbox";
import { PAGE_SIZES, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";
import { publicMediaUrl } from "@/lib/r2";
import { Prisma } from "@/generated/prisma/client";
import type { z } from "zod";
import type { agencyRegistrationSchema, agentProfileUpdateSchema, agentRegistrationSchema, agentResubmissionSchema } from "@/lib/schemas";

type AgencyInput = z.infer<typeof agencyRegistrationSchema>;
type AgentInput = z.infer<typeof agentRegistrationSchema>;
type AgentProfileUpdateInput = z.infer<typeof agentProfileUpdateSchema>;
type AgentResubmissionInput = z.infer<typeof agentResubmissionSchema>;

export async function registerAgency(userId: string, userName: string, input: AgencyInput) {
  const existing = await prisma.agencyMembership.findUnique({ where: { userId } });
  if (existing) throw new ApiError(409, "AGENCY_ALREADY_REGISTERED", "This account already belongs to an agency.");

  try {
    return await prisma.$transaction(async (tx) => {
      const agency = await tx.agency.create({
        data: {
          name: input.name,
          eacRegistrationNumber: input.eacRegistrationNumber.toUpperCase(),
          email: input.email.toLowerCase(),
          phone: input.phone,
          address: input.address,
          status: "PENDING_REVIEW",
          memberships: { create: { userId, role: "AGENCY_ADMIN", status: "ACTIVE" } },
        },
      });
      await appendAuditEvent(tx, {
        actorUserId: userId,
        agencyId: agency.id,
        action: "agency.registration_submitted",
        entityType: "Agency",
        entityId: agency.id,
        payload: { eacRegistrationNumber: agency.eacRegistrationNumber },
      });
      await enqueueOutbox(tx, {
        topic: "email.send",
        aggregateType: "Agency",
        aggregateId: agency.id,
        payload: {
          to: input.email,
          subject: "Property Connect agency application received",
          text: `Hello ${userName}, your agency application is now awaiting manual EAC review. We will notify you when its status changes.`,
        },
      });
      return agency;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existingMembership = await prisma.agencyMembership.findUnique({ where: { userId }, select: { id: true } });
      if (existingMembership) throw new ApiError(409, "AGENCY_ALREADY_REGISTERED", "This account already belongs to an agency. Open its workspace or use a different named account for another agency.");
      throw new ApiError(409, "EAC_ALREADY_REGISTERED", "That EAC registration is already on file.");
    }
    throw error;
  }
}

export async function inviteAgent(input: {
  agencyId: string;
  actorUserId: string;
  parentAgentId?: string;
  email: string;
  expiresInDays: number;
  appUrl: string;
}) {
  return prisma.$transaction(async (tx) => issueAgentInvitation(tx, input));
}

async function validateInvitationParent(tx: Prisma.TransactionClient, agencyId: string, parentAgentId?: string | null) {
  if (!parentAgentId) return;
  const parent = await tx.agentProfile.findUnique({ where: { id: parentAgentId } });
  if (!parent || parent.agencyId !== agencyId || parent.status !== "ACTIVE" || parent.parentAgentId) {
    throw new ApiError(403, "SUBAGENT_PARENT_INVALID", "Only an active lead agent in this agency can invite a subagent.");
  }
}

async function issueAgentInvitation(
  tx: Prisma.TransactionClient,
  input: { agencyId: string; actorUserId: string; parentAgentId?: string | null; email: string; expiresInDays: number; appUrl: string },
) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Agency" WHERE "id" = ${input.agencyId} FOR NO KEY UPDATE`);
  const agency = await tx.agency.findUnique({ where: { id: input.agencyId }, select: { id: true, name: true, status: true } });
  if (!agency || agency.status !== "ACTIVE") throw new ApiError(403, "AGENCY_NOT_ACTIVE", "Only an active agency can invite agents.");
  if (input.parentAgentId) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AgentProfile" WHERE "id" = ${input.parentAgentId} FOR SHARE`);
  }
  await validateInvitationParent(tx, agency.id, input.parentAgentId);
  const email = input.email.toLowerCase();
  const now = new Date();
  const previous = await tx.agentInvitation.findMany({
    where: {
      agencyId: agency.id,
      parentAgentId: input.parentAgentId ?? null,
      email,
      acceptedAt: null,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (previous.length) {
    await tx.agentInvitation.updateMany({
      where: { id: { in: previous.map((invitation) => invitation.id) }, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now, revokedByUserId: input.actorUserId },
    });
    for (const invitation of previous) {
      await appendAuditEvent(tx, {
        actorUserId: input.actorUserId,
        agencyId: agency.id,
        action: "agent.invitation_replaced",
        entityType: "AgentInvitation",
        entityId: invitation.id,
        payload: { email },
      });
    }
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + input.expiresInDays * 86_400_000);
  const created = await tx.agentInvitation.create({
    data: {
      agencyId: agency.id,
      parentAgentId: input.parentAgentId ?? null,
      email,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      invitedByUserId: input.actorUserId,
      expiresAt,
    },
  });
  await appendAuditEvent(tx, {
    actorUserId: input.actorUserId,
    agencyId: agency.id,
    action: "agent.invitation_created",
    entityType: "AgentInvitation",
    entityId: created.id,
    payload: { email, expiresAt: expiresAt.toISOString(), parentAgentId: input.parentAgentId ?? null },
  });
  const invitationUrl = new URL("/register/agent?invite=" + encodeURIComponent(token), input.appUrl).toString();
  await enqueueOutbox(tx, {
    topic: "email.send",
    aggregateType: "AgentInvitation",
    aggregateId: created.id,
    payload: {
      to: email,
      subject: `Invitation to join ${agency.name} on Property Connect`,
      text: `You have been invited to register as an agent with ${agency.name}. Complete your registration here: ${invitationUrl}`,
    },
  });
  return { id: created.id, expiresAt };
}

export async function listAgentInvitations(scope: { agencyId: string; parentAgentId: string | null }, params = new URLSearchParams()) {
  const now = new Date();
  const q = params.get("q")?.trim();
  const status = params.get("status");
  const where = {
    agencyId: scope.agencyId,
    parentAgentId: scope.parentAgentId,
    ...(q ? { email: { contains: q, mode: "insensitive" as const } } : {}),
    ...(status === "REVOKED" ? { revokedAt: { not: null } }
      : status === "ACCEPTED" ? { acceptedAt: { not: null }, revokedAt: null }
        : status === "EXPIRED" ? { acceptedAt: null, revokedAt: null, expiresAt: { lte: now } }
          : status === "PENDING" ? { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } : {}),
  };
  const totalItems = await prisma.agentInvitation.count({ where });
  const window = paginationWindow(totalItems, PAGE_SIZES.workspace, requestedPage(params));
  const invitations = await prisma.agentInvitation.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: window.skip, take: window.pageSize,
    select: { id: true, email: true, createdAt: true, expiresAt: true, acceptedAt: true, revokedAt: true },
  });
  const items = invitations.map((invitation) => ({
    ...invitation,
    status: invitation.revokedAt ? "REVOKED" as const
      : invitation.acceptedAt ? "ACCEPTED" as const
        : invitation.expiresAt <= now ? "EXPIRED" as const : "PENDING" as const,
  }));
  return paginationEnvelope(items, window);
}

export async function revokeAgentInvitation(input: {
  id: string; scope: { agencyId: string; parentAgentId: string | null }; actorUserId: string; reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.agentInvitation.findFirst({
      where: { id: input.id, agencyId: input.scope.agencyId, parentAgentId: input.scope.parentAgentId },
    });
    if (!invitation) throw new ApiError(404, "NOT_FOUND", "This invitation could not be found.");
    if (invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
      throw new ApiError(409, "INVITATION_NOT_PENDING", "Only a pending invitation can be revoked.");
    }
    const now = new Date();
    const changed = await tx.agentInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now, revokedByUserId: input.actorUserId },
    });
    if (changed.count !== 1) throw new ApiError(409, "INVITATION_NOT_PENDING", "This invitation has already changed state.");
    await appendAuditEvent(tx, {
      actorUserId: input.actorUserId,
      agencyId: invitation.agencyId,
      action: "agent.invitation_revoked",
      entityType: "AgentInvitation",
      entityId: invitation.id,
      payload: { email: invitation.email, reason: input.reason },
    });
    return { id: invitation.id, status: "REVOKED" as const, revokedAt: now };
  });
}

export async function resendAgentInvitation(input: {
  id: string; scope: { agencyId: string; parentAgentId: string | null }; actorUserId: string; expiresInDays: number; appUrl: string;
}) {
  const invitation = await prisma.agentInvitation.findFirst({
    where: { id: input.id, agencyId: input.scope.agencyId, parentAgentId: input.scope.parentAgentId },
    include: { agency: { select: { id: true, name: true, status: true } } },
  });
  if (!invitation) throw new ApiError(404, "NOT_FOUND", "This invitation could not be found.");
  if (invitation.acceptedAt || invitation.revokedAt) throw new ApiError(409, "INVITATION_NOT_RESENDABLE", "Accepted or revoked invitations cannot be resent.");
  if (invitation.agency.status !== "ACTIVE") throw new ApiError(409, "AGENCY_NOT_ACTIVE", "This agency is not currently accepting agent registrations.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Agency" WHERE "id" = ${invitation.agencyId} FOR NO KEY UPDATE`);
    if (invitation.parentAgentId) {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AgentProfile" WHERE "id" = ${invitation.parentAgentId} FOR SHARE`);
    }
    const changed = await tx.agentInvitation.updateMany({
      where: { id: invitation.id, agencyId: input.scope.agencyId, parentAgentId: input.scope.parentAgentId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date(), revokedByUserId: input.actorUserId },
    });
    if (changed.count !== 1) throw new ApiError(409, "INVITATION_NOT_RESENDABLE", "This invitation has already changed state.");
    await appendAuditEvent(tx, {
      actorUserId: input.actorUserId,
      agencyId: invitation.agencyId,
      action: "agent.invitation_resent",
      entityType: "AgentInvitation",
      entityId: invitation.id,
      payload: { email: invitation.email },
    });
    return issueAgentInvitation(tx, {
      agencyId: invitation.agencyId,
      actorUserId: input.actorUserId,
      parentAgentId: invitation.parentAgentId,
      email: invitation.email,
      expiresInDays: input.expiresInDays,
      appUrl: input.appUrl,
    });
  });
}

export async function registerAgent(user: { id: string; name: string; email: string }, input: AgentInput) {
  if (input.photoObjectKey && !input.photoObjectKey.startsWith("media/" + user.id + "/")) {
    throw new ApiError(400, "INVALID_MEDIA_KEY", "Only a photo uploaded to your account can be attached.");
  }
  if (await prisma.agentProfile.findUnique({ where: { userId: user.id }, select: { id: true } })) {
    throw new ApiError(409, "AGENT_PROFILE_EXISTS", "This account already has an agent profile. Sign in to manage the existing profile; a second agent profile cannot be created for this account.");
  }
  const tokenHash = createHash("sha256").update(input.invitationToken).digest("hex");
  const invitation = await prisma.agentInvitation.findUnique({ where: { tokenHash }, include: { agency: true } });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
    throw new ApiError(400, "INVITATION_INVALID", "This invitation is invalid or expired.");
  }
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new ApiError(403, "INVITATION_EMAIL_MISMATCH", "Sign in with the email address that received the invitation.");
  }
  if (invitation.agency.status !== "ACTIVE") throw new ApiError(409, "AGENCY_NOT_ACTIVE", "This agency is not currently accepting agent registrations.");
  if (invitation.parentAgentId) {
    const parent = await prisma.agentProfile.findUnique({ where: { id: invitation.parentAgentId } });
    if (!parent || parent.agencyId !== invitation.agencyId || parent.status !== "ACTIVE" || parent.parentAgentId) {
      throw new ApiError(409, "SUBAGENT_PARENT_INVALID", "The inviting agent is no longer eligible to add a subagent.");
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      if (await tx.agentProfile.findUnique({ where: { userId: user.id }, select: { id: true } })) {
        throw new ApiError(409, "AGENT_PROFILE_EXISTS", "This account already has an agent profile. Sign in to manage the existing profile.");
      }
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Agency" WHERE "id" = ${invitation.agencyId} FOR SHARE`);
      const currentAgency = await tx.agency.findUnique({ where: { id: invitation.agencyId }, select: { status: true } });
      if (!currentAgency || currentAgency.status !== "ACTIVE") throw new ApiError(409, "AGENCY_NOT_ACTIVE", "This agency is no longer accepting agent registrations.");
      if (invitation.parentAgentId) {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AgentProfile" WHERE "id" = ${invitation.parentAgentId} FOR SHARE`);
        const currentParent = await tx.agentProfile.findUnique({ where: { id: invitation.parentAgentId } });
        if (!currentParent || currentParent.agencyId !== invitation.agencyId || currentParent.status !== "ACTIVE" || currentParent.parentAgentId) {
          throw new ApiError(409, "SUBAGENT_PARENT_INVALID", "The inviting agent is no longer eligible to add a subagent.");
        }
      }
      const claimed = await tx.agentInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ApiError(409, "INVITATION_ALREADY_USED", "This invitation has already been used.");
      const profile = await tx.agentProfile.create({
        data: {
          userId: user.id,
          agencyId: invitation.agencyId,
          parentAgentId: invitation.parentAgentId,
          fullName: input.fullName,
          phone: input.phone,
          eacRegistrationNumber: input.eacRegistrationNumber.toUpperCase(),
          photoUrl: input.photoObjectKey ? publicMediaUrl(input.photoObjectKey) : undefined,
          status: "PENDING_REVIEW",
        },
      });
      await appendAuditEvent(tx, {
        actorUserId: user.id,
        agencyId: invitation.agencyId,
        action: "agent.registration_submitted",
        entityType: "AgentProfile",
        entityId: profile.id,
        payload: { eacRegistrationNumber: profile.eacRegistrationNumber },
      });
      return profile;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existingProfile = await prisma.agentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (existingProfile) throw new ApiError(409, "AGENT_PROFILE_EXISTS", "This account already has an agent profile. Sign in to manage the existing profile.");
      throw new ApiError(409, "EAC_ALREADY_REGISTERED", "That EAC registration is already on file.");
    }
    throw error;
  }
}

export async function updateAgentProfile(userId: string, input: AgentProfileUpdateInput) {
  if (input.photoObjectKey && !input.photoObjectKey.startsWith("media/" + userId + "/")) {
    throw new ApiError(400, "INVALID_MEDIA_KEY", "Only a photo uploaded to your account can be attached.");
  }
  return prisma.$transaction(async (tx) => {
    const current = await tx.agentProfile.findUnique({ where: { userId } });
    if (!current) throw new ApiError(404, "AGENT_PROFILE_NOT_FOUND", "An agent profile could not be found for this account.");
    const [profile] = await Promise.all([
      tx.agentProfile.update({
        where: { id: current.id },
        data: {
          fullName: input.fullName,
          phone: input.phone,
          bio: input.bio,
          ...(input.photoObjectKey ? { photoUrl: publicMediaUrl(input.photoObjectKey) } : {}),
        },
      }),
      tx.user.update({ where: { id: userId }, data: { name: input.fullName } }),
    ]);
    await appendAuditEvent(tx, {
      actorUserId: userId, agencyId: current.agencyId, action: "agent.profile_updated",
      entityType: "AgentProfile", entityId: current.id,
      payload: { fullName: profile.fullName, phone: profile.phone, photoChanged: Boolean(input.photoObjectKey) },
    });
    return profile;
  });
}

async function revokeOpenAgentInvitations(
  tx: Prisma.TransactionClient,
  where: Prisma.AgentInvitationWhereInput,
  actorUserId: string,
  action: string,
  reason?: string,
) {
  const open = await tx.agentInvitation.findMany({
    where: { ...where, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, agencyId: true, email: true },
  });
  if (!open.length) return;
  const revokedAt = new Date();
  await tx.agentInvitation.updateMany({
    where: { id: { in: open.map((invitation) => invitation.id) }, acceptedAt: null, revokedAt: null },
    data: { revokedAt, revokedByUserId: actorUserId },
  });
  for (const invitation of open) {
    await appendAuditEvent(tx, {
      actorUserId,
      agencyId: invitation.agencyId,
      action,
      entityType: "AgentInvitation",
      entityId: invitation.id,
      payload: { email: invitation.email, reason },
    });
  }
}

export async function resubmitAgentProfile(userId: string, input: AgentResubmissionInput) {
  if (input.photoObjectKey && !input.photoObjectKey.startsWith("media/" + userId + "/")) {
    throw new ApiError(400, "INVALID_MEDIA_KEY", "Only a photo uploaded to your account can be attached.");
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.agentProfile.findUnique({ where: { userId }, include: { agency: { select: { status: true } } } });
      if (!current) throw new ApiError(404, "AGENT_PROFILE_NOT_FOUND", "An agent profile could not be found for this account.");
      if (current.status !== "REJECTED") throw new ApiError(409, "AGENT_RESUBMISSION_UNAVAILABLE", "Only a rejected agent profile can be corrected and resubmitted.");
      if (current.agency.status !== "ACTIVE") throw new ApiError(409, "AGENCY_NOT_ACTIVE", "The agency must be active before this agent registration can be resubmitted.");
      const profile = await tx.agentProfile.update({
        where: { id: current.id },
        data: {
          fullName: input.fullName,
          eacRegistrationNumber: input.eacRegistrationNumber.toUpperCase(),
          phone: input.phone,
          ...(input.photoObjectKey ? { photoUrl: publicMediaUrl(input.photoObjectKey) } : {}),
          status: "PENDING_REVIEW",
          reviewNotes: null,
          reviewedAt: null,
          reviewedByUserId: null,
        },
      });
      await tx.user.update({ where: { id: userId }, data: { name: input.fullName } });
      await appendAuditEvent(tx, {
        actorUserId: userId,
        agencyId: profile.agencyId,
        action: "agent.registration_resubmitted",
        entityType: "AgentProfile",
        entityId: profile.id,
        payload: { eacRegistrationNumber: profile.eacRegistrationNumber },
      });
      return profile;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "EAC_ALREADY_REGISTERED", "That EAC registration is already on file.");
    throw error;
  }
}

export async function reviewAgency(input: {
  agencyId: string;
  actorUserId: string;
  decision: "approve" | "reject" | "suspend" | "restore";
  notes?: string;
}) {
  const map = { approve: "ACTIVE", reject: "REJECTED", suspend: "SUSPENDED", restore: "ACTIVE" } as const;
  return prisma.$transaction(async (tx) => {
    const agency = await tx.agency.findUnique({ where: { id: input.agencyId } });
    if (!agency) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
    const allowed: Record<typeof agency.status, readonly (typeof input.decision)[]> = {
      PENDING_REVIEW: ["approve", "reject"], ACTIVE: ["suspend"], SUSPENDED: ["restore"], REJECTED: [], DEREGISTERED: [],
    };
    if (!allowed[agency.status].includes(input.decision)) {
      throw new ApiError(409, "INVALID_REVIEW_STATE", `The ${input.decision} decision is not valid while this agency is ${agency.status.toLowerCase()}.`);
    }
    const updated = await tx.agency.update({
      where: { id: agency.id },
      data: { status: map[input.decision], reviewNotes: input.notes, reviewedAt: new Date(), reviewedByUserId: input.actorUserId },
    });
    await appendAuditEvent(tx, {
      actorUserId: input.actorUserId,
      agencyId: agency.id,
      action: `agency.${input.decision}`,
      entityType: "Agency",
      entityId: agency.id,
      payload: { previousStatus: agency.status, status: updated.status, notes: input.notes },
    });
    if (input.decision === "suspend") {
      await revokeOpenAgentInvitations(tx, { agencyId: agency.id }, input.actorUserId, "agent.invitation_revoked_by_agency_suspension", input.notes);
    }
    return updated;
  });
}

export async function reviewAgent(input: {
  agentProfileId: string;
  actorUserId: string;
  agencyId?: string;
  decision: "approve" | "reject" | "suspend" | "restore";
  notes?: string;
}) {
  const map = { approve: "ACTIVE", reject: "REJECTED", suspend: "SUSPENDED", restore: "ACTIVE" } as const;
  return prisma.$transaction(async (tx) => {
    const profile = await tx.agentProfile.findFirst({
      where: { id: input.agentProfileId, ...(input.agencyId ? { agencyId: input.agencyId } : {}) },
      include: { agency: { select: { status: true } } },
    });
    if (!profile) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
    const allowed: Record<typeof profile.status, readonly (typeof input.decision)[]> = {
      PENDING_REVIEW: ["approve", "reject"], ACTIVE: ["suspend"], SUSPENDED: ["restore"], REJECTED: [],
    };
    if (!allowed[profile.status].includes(input.decision)) {
      throw new ApiError(409, "INVALID_REVIEW_STATE", `The ${input.decision} decision is not valid while this agent is ${profile.status.toLowerCase()}.`);
    }
    if (input.decision === "approve" && profile.agency.status !== "ACTIVE") {
      throw new ApiError(409, "AGENCY_NOT_ACTIVE", "An agent profile cannot be approved while its agency is inactive.");
    }
    if (input.decision === "approve" && profile.parentAgentId) {
      const parent = await tx.agentProfile.findUnique({ where: { id: profile.parentAgentId } });
      if (!parent || parent.agencyId !== profile.agencyId || parent.parentAgentId || parent.status !== "ACTIVE") {
        throw new ApiError(409, "SUBAGENT_PARENT_INVALID", "An agent cannot be approved while its lead agent is inactive.");
      }
    }
    const updated = await tx.agentProfile.update({
      where: { id: profile.id },
      data: { status: map[input.decision], reviewNotes: input.notes, reviewedAt: new Date(), reviewedByUserId: input.actorUserId },
    });
    await appendAuditEvent(tx, {
      actorUserId: input.actorUserId,
      agencyId: profile.agencyId,
      action: `agent.${input.decision}`,
      entityType: "AgentProfile",
      entityId: profile.id,
      payload: { previousStatus: profile.status, status: updated.status, notes: input.notes },
    });
    if (input.decision === "suspend") {
      await revokeOpenAgentInvitations(tx, { parentAgentId: profile.id }, input.actorUserId, "agent.invitation_revoked_by_parent_suspension", input.notes);
    }
    await enqueueOutbox(tx, {
      topic: "email.send",
      aggregateType: "AgentProfile",
      aggregateId: profile.id,
      payload: {
        to: (await tx.user.findUniqueOrThrow({ where: { id: profile.userId }, select: { email: true } })).email,
        subject: input.decision === "approve" ? "Your agent profile is approved" : "Your agent profile status changed",
        text: input.decision === "approve"
          ? "Your EAC registration has been reviewed and approved. You can now purchase or activate a Gold Card."
          : `Your agent profile status is now ${updated.status}. Sign in to view your next steps.`,
      },
    });
    return updated;
  });
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
