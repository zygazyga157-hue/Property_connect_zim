import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { appendAuditEvent } from "@/lib/audit/chain";
import { enqueueOutbox } from "@/lib/outbox";
import { requireActiveAgent, type CurrentUser } from "@/lib/authz";
import type { PropertyInput } from "@/lib/schemas";
import { hashClientIp } from "@/lib/rate-limit";
import { publicMediaUrl } from "@/lib/r2";
import { PAGE_SIZES, paginationEnvelope, paginationWindow, requestedPage } from "@/lib/pagination";

const publicPropertySelect = {
  id: true, slug: true, title: true, description: true, propertyType: true, purpose: true,
  priceAmount: true, priceCurrency: true, bedrooms: true, bathrooms: true, floorAreaSqm: true,
  landAreaSqm: true, address: true, suburb: true, city: true, province: true, features: true,
  publishedAt: true,
  images: { orderBy: { sortOrder: "asc" as const }, select: { id: true, publicUrl: true, altText: true } },
  agentProfile: {
    select: {
      id: true, fullName: true, photoUrl: true, eacRegistrationNumber: true, status: true,
      user: { select: { id: true } }, agency: { select: { id: true, name: true, status: true } },
    },
  },
};

async function requireActiveCardForWrite(tx: Prisma.TransactionClient, agentProfileId: string, userId: string) {
  const profile = await tx.agentProfile.findUnique({
    where: { id: agentProfileId },
    include: { agency: true, user: { select: { isSuspended: true, emailVerified: true } } },
  });
  if (!profile || profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE") {
    throw new ApiError(403, "AGENT_PENDING", "An active agent profile in an active agency is required to publish listings.");
  }
  if (profile.userId !== userId || profile.user.isSuspended || !profile.user.emailVerified) {
    throw new ApiError(403, "AGENT_ACCOUNT_INACTIVE", "The listing owner account must be active and verified.");
  }
  const activeCard = await tx.goldCard.findFirst({
    where: { OR: [{ ownerUserId: userId }, { agentProfileId }], status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { id: true, serial: true },
  });
  if (!activeCard) throw new ApiError(403, "ACTIVE_CARD_REQUIRED", "Renew your Gold Card to publish or update listings.");
  return activeCard;
}

export async function listPublicProperties(search: URLSearchParams) {
  const q = search.get("q")?.trim();
  const city = search.get("city")?.trim();
  const purpose = search.get("purpose");
  const propertyType = search.get("type");
  const requested = requestedPage(search);
  const where: Prisma.PropertyWhereInput = {
    status: "PUBLISHED",
    agentProfile: { status: "ACTIVE", agency: { status: "ACTIVE" } },
    ...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
    ...(purpose && ["SALE", "RENT", "SHORT_STAY"].includes(purpose) ? { purpose: purpose as "SALE" | "RENT" | "SHORT_STAY" } : {}),
    ...(propertyType && ["HOUSE", "APARTMENT", "TOWNHOUSE", "LAND", "COMMERCIAL", "FARM", "OTHER"].includes(propertyType)
      ? { propertyType: propertyType as "HOUSE" | "APARTMENT" | "TOWNHOUSE" | "LAND" | "COMMERCIAL" | "FARM" | "OTHER" } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { suburb: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const totalItems = await prisma.property.count({ where });
  const window = paginationWindow(totalItems, PAGE_SIZES.properties, requested);
  const items = await prisma.property.findMany({ where, select: publicPropertySelect, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize });
  return paginationEnvelope(items, window);
}

export async function getPublicProperty(idOrSlug: string) {
  const property = await prisma.property.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], status: "PUBLISHED", agentProfile: { status: "ACTIVE", agency: { status: "ACTIVE" } } },
    select: publicPropertySelect,
  });
  if (!property) throw new ApiError(404, "NOT_FOUND", "This property could not be found.");
  return property;
}

function slugify(text: string) {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}

export async function createProperty(user: CurrentUser, input: PropertyInput) {
  const { profile } = await requireActiveAgent(user);
  if (input.imageObjectKeys.some((key) => !key.startsWith("media/" + user.id + "/"))) {
    throw new ApiError(400, "INVALID_MEDIA_KEY", "Only media uploaded to your account can be attached.");
  }
  const id = randomUUID();
  const slug = (slugify(input.title) || "property") + "-" + id.slice(0, 8);
  return prisma.$transaction(async (tx) => {
    const activeCard = await requireActiveCardForWrite(tx, profile.id, user.id);
    const record = await tx.property.create({
      data: {
        id, slug, agencyId: profile.agencyId, agentProfileId: profile.id,
        title: input.title, description: input.description, propertyType: input.propertyType,
        purpose: input.purpose, status: "PUBLISHED", priceAmount: input.priceAmount,
        priceCurrency: input.priceCurrency, bedrooms: input.bedrooms, bathrooms: input.bathrooms,
        floorAreaSqm: input.floorAreaSqm, landAreaSqm: input.landAreaSqm, address: input.address,
        suburb: input.suburb, city: input.city, province: input.province, latitude: input.latitude,
        longitude: input.longitude, features: input.features ?? Prisma.JsonNull, publishedAt: new Date(),
        images: { create: input.imageObjectKeys.map((objectKey, sortOrder) => ({
          objectKey, publicUrl: publicMediaUrl(objectKey), sortOrder, altText: input.title,
        })) },
      },
      select: { id: true, slug: true, status: true },
    });
    await appendAuditEvent(tx, {
      actorUserId: user.id, agencyId: profile.agencyId, action: "property.published",
      entityType: "Property", entityId: record.id, payload: { title: input.title, slug, cardSerial: activeCard.serial },
    });
    return record;
  }, { isolationLevel: "Serializable" });
}

export async function listManagedProperties(user: CurrentUser, params = new URLSearchParams()) {
  const profile = await prisma.agentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  const memberships = await prisma.agencyMembership.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { agencyId: true, role: true } });
  const agencyAdminIds = memberships.map((item) => item.agencyId);
  const where: Prisma.PropertyWhereInput = profile
    ? { agentProfileId: profile.id }
    : agencyAdminIds.length ? { agencyId: { in: agencyAdminIds } } : { id: "__no_access__" };
  const q = params.get("q")?.trim();
  const status = params.get("status");
  const filteredWhere: Prisma.PropertyWhereInput = {
    AND: [where,
      ...(q ? [{ OR: [{ title: { contains: q, mode: "insensitive" as const } }, { city: { contains: q, mode: "insensitive" as const } }, { suburb: { contains: q, mode: "insensitive" as const } }] }] : []),
      ...(status && ["DRAFT", "PUBLISHED", "PAUSED", "ARCHIVED", "PENDING_REVIEW", "REJECTED"].includes(status) ? [{ status: status as Prisma.EnumPropertyStatusFilter["equals"] }] : []),
    ],
  };
  const totalItems = await prisma.property.count({ where: filteredWhere });
  const window = paginationWindow(totalItems, PAGE_SIZES.workspace, requestedPage(params));
  const items = await prisma.property.findMany({
    where: filteredWhere, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize,
    include: { images: { orderBy: { sortOrder: "asc" } }, agentProfile: { select: { id: true, fullName: true } } },
  });
  return paginationEnvelope(items, window);
}

export async function updateProperty(user: CurrentUser, propertyId: string, input: PropertyInput) {
  const { profile } = await requireActiveAgent(user);
  const current = await prisma.property.findFirst({ where: { id: propertyId, agentProfileId: profile.id } });
  if (!current) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
  if (input.imageObjectKeys.some((key) => !key.startsWith("media/" + user.id + "/"))) {
    throw new ApiError(400, "INVALID_MEDIA_KEY", "Only media uploaded to your account can be attached.");
  }
  return prisma.$transaction(async (tx) => {
    const activeCard = await requireActiveCardForWrite(tx, profile.id, user.id);
    await tx.propertyImage.deleteMany({ where: { propertyId } });
    const updated = await tx.property.update({
      where: { id: propertyId },
      data: {
        title: input.title, description: input.description, propertyType: input.propertyType,
        purpose: input.purpose, priceAmount: input.priceAmount, priceCurrency: input.priceCurrency,
        bedrooms: input.bedrooms, bathrooms: input.bathrooms, floorAreaSqm: input.floorAreaSqm,
        landAreaSqm: input.landAreaSqm, address: input.address, suburb: input.suburb,
        city: input.city, province: input.province, latitude: input.latitude, longitude: input.longitude,
        features: input.features ?? Prisma.JsonNull, status: "PUBLISHED", publishedAt: current.publishedAt ?? new Date(),
        images: { create: input.imageObjectKeys.map((objectKey, sortOrder) => ({
          objectKey, publicUrl: publicMediaUrl(objectKey), sortOrder, altText: input.title,
        })) },
      },
      select: { id: true, slug: true, status: true },
    });
    await appendAuditEvent(tx, {
      actorUserId: user.id, agencyId: profile.agencyId, action: "property.updated",
      entityType: "Property", entityId: propertyId, payload: { cardSerial: activeCard.serial },
    });
    return updated;
  }, { isolationLevel: "Serializable" });
}

export async function archiveProperty(user: CurrentUser, propertyId: string) {
  const { profile } = await requireActiveAgent(user);
  return prisma.$transaction(async (tx) => {
    const activeCard = await requireActiveCardForWrite(tx, profile.id, user.id);
    const result = await tx.property.updateMany({
      where: { id: propertyId, agentProfileId: profile.id, status: { not: "ARCHIVED" } },
      data: { status: "ARCHIVED" },
    });
    if (!result.count) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
    await appendAuditEvent(tx, {
      actorUserId: user.id, agencyId: profile.agencyId, action: "property.archived",
      entityType: "Property", entityId: propertyId, payload: { cardSerial: activeCard.serial },
    });
    return { id: propertyId, status: "ARCHIVED" };
  }, { isolationLevel: "Serializable" });
}

export async function updateAgencyPropertyStatus(user: CurrentUser, propertyId: string, status: "PUBLISHED" | "ARCHIVED") {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, agency: { memberships: { some: { userId: user.id, status: "ACTIVE" } } } },
    include: { agentProfile: { include: { agency: true, user: { select: { isSuspended: true, emailVerified: true } } } } },
  });
  if (!property) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
  if (property.agentProfile.agency.status !== "ACTIVE" || property.agentProfile.status !== "ACTIVE") {
    throw new ApiError(409, "AGENT_NOT_ACTIVE", "Listings can only be managed for an active agency and agent.");
  }
  if (status === "PUBLISHED") {
    if (property.agentProfile.user.isSuspended || !property.agentProfile.user.emailVerified) throw new ApiError(403, "AGENT_ACCOUNT_INACTIVE", "The listing owner account must be active and verified before publishing.");
    const activeCard = await prisma.goldCard.findFirst({
      where: { OR: [{ ownerUserId: property.agentProfile.userId }, { agentProfileId: property.agentProfileId }], status: "ACTIVE", expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (!activeCard) throw new ApiError(403, "ACTIVE_CARD_REQUIRED", "The listing owner needs an active Gold Card before publishing.");
  }
  return prisma.$transaction(async (tx) => {
    const activeCard = status === "PUBLISHED"
      ? await requireActiveCardForWrite(tx, property.agentProfileId, property.agentProfile.userId)
      : null;
    const updated = await tx.property.update({ where: { id: property.id }, data: { status, publishedAt: status === "PUBLISHED" ? property.publishedAt ?? new Date() : property.publishedAt } });
    await appendAuditEvent(tx, { actorUserId: user.id, agencyId: property.agencyId, action: "property.agency_status_changed", entityType: "Property", entityId: property.id, payload: { from: property.status, to: status, cardSerial: activeCard?.serial ?? null } });
    return updated;
  }, { isolationLevel: "Serializable" });
}

export async function updateAgencyProperty(user: CurrentUser, propertyId: string, input: PropertyInput) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, agency: { status: "ACTIVE", memberships: { some: { userId: user.id, status: "ACTIVE" } } } },
    include: { agentProfile: { include: { user: { select: { isSuspended: true, emailVerified: true } } } } },
  });
  if (!property) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
  if (property.agentProfile.status !== "ACTIVE") throw new ApiError(409, "AGENT_NOT_ACTIVE", "The listing owner must have an active agent record.");
  if (property.agentProfile.user.isSuspended || !property.agentProfile.user.emailVerified) throw new ApiError(403, "AGENT_ACCOUNT_INACTIVE", "The listing owner account must be active and verified.");
  const activeCard = await prisma.goldCard.findFirst({
    where: { OR: [{ ownerUserId: property.agentProfile.userId }, { agentProfileId: property.agentProfileId }], status: "ACTIVE", expiresAt: { gt: new Date() } },
    select: { serial: true },
  });
  if (!activeCard) throw new ApiError(403, "ACTIVE_CARD_REQUIRED", "The listing owner needs an active Gold Card before this listing can be updated.");
  if (input.imageObjectKeys.some((key) => !key.startsWith("media/" + user.id + "/"))) throw new ApiError(400, "INVALID_MEDIA_KEY", "Only media uploaded to your account can be attached.");
  return prisma.$transaction(async (tx) => {
    const currentActiveCard = await requireActiveCardForWrite(tx, property.agentProfileId, property.agentProfile.userId);
    await tx.propertyImage.deleteMany({ where: { propertyId } });
    const updated = await tx.property.update({
      where: { id: propertyId },
      data: {
        title: input.title, description: input.description, propertyType: input.propertyType,
        purpose: input.purpose, priceAmount: input.priceAmount, priceCurrency: input.priceCurrency,
        bedrooms: input.bedrooms, bathrooms: input.bathrooms, floorAreaSqm: input.floorAreaSqm,
        landAreaSqm: input.landAreaSqm, address: input.address, suburb: input.suburb,
        city: input.city, province: input.province, latitude: input.latitude, longitude: input.longitude,
        features: input.features ?? Prisma.JsonNull, status: "PUBLISHED", publishedAt: property.publishedAt ?? new Date(),
        images: { create: input.imageObjectKeys.map((objectKey, sortOrder) => ({ objectKey, publicUrl: publicMediaUrl(objectKey), sortOrder, altText: input.title })) },
      }, select: { id: true, slug: true, status: true },
    });
    await appendAuditEvent(tx, { actorUserId: user.id, agencyId: property.agencyId, action: "property.agency_updated", entityType: "Property", entityId: propertyId, payload: { cardSerial: currentActiveCard.serial } });
    return updated;
  }, { isolationLevel: "Serializable" });
}

export async function createPublicEnquiry(input: {
  propertyId: string; buyerName: string; buyerEmail: string; buyerPhone?: string; message: string; ip?: string;
  buyerUser?: { id: string; name: string; email: string };
}) {
  const property = await prisma.property.findFirst({
    where: { id: input.propertyId, status: "PUBLISHED", agentProfile: { status: "ACTIVE", agency: { status: "ACTIVE" } } },
    select: { id: true, title: true, agencyId: true, agentProfileId: true, agentProfile: { select: { userId: true } } },
  });
  if (!property) throw new ApiError(404, "NOT_FOUND", "This property is not accepting enquiries.");
  const buyerName = input.buyerUser?.name ?? input.buyerName;
  const buyerEmail = input.buyerUser?.email ?? input.buyerEmail;
  return prisma.$transaction(async (tx) => {
    const record = await tx.enquiry.create({
      data: {
        propertyId: property.id, agencyId: property.agencyId, agentProfileId: property.agentProfileId,
        assignedAgentProfileId: property.agentProfileId,
        buyerUserId: input.buyerUser?.id,
        buyerName, buyerEmail: buyerEmail.toLowerCase(), buyerPhone: input.buyerPhone,
        message: input.message, ipHash: input.ip ? hashClientIp(input.ip) : undefined,
      },
      select: { id: true, createdAt: true },
    });
    await tx.enquiryActivity.create({
      data: { enquiryId: record.id, actorUserId: input.buyerUser?.id, action: "ENQUIRY_RECEIVED" },
    });
    await appendAuditEvent(tx, {
      actorUserId: input.buyerUser?.id, agencyId: property.agencyId, action: "enquiry.received", entityType: "Enquiry", entityId: record.id,
      payload: { propertyId: property.id, agentProfileId: property.agentProfileId },
    });
    const agent = await tx.user.findUnique({ where: { id: property.agentProfile.userId }, select: { email: true } });
    if (agent) await enqueueOutbox(tx, {
      topic: "email.send", aggregateType: "Enquiry", aggregateId: record.id,
      payload: {
        to: agent.email, subject: "New enquiry for " + property.title,
        text: buyerName + " (" + buyerEmail + ") asked about " + property.title + ".\n\n" + input.message,
      },
    });
    return record;
  });
}

async function leadListWhere(user: CurrentUser, params: URLSearchParams): Promise<Prisma.EnquiryWhereInput> {
  const profile = await prisma.agentProfile.findUnique({
    where: { userId: user.id }, include: { subagents: { select: { id: true } }, agency: { select: { status: true } } },
  });
  let scopeWhere: Prisma.EnquiryWhereInput;
  if (profile) {
    if (profile.status !== "ACTIVE" || profile.agency.status !== "ACTIVE") {
      throw new ApiError(403, "AGENT_NOT_ACTIVE", "An active agent profile in an active agency is required to view agent enquiries.");
    }
    const visibleAgentIds = [profile.id, ...profile.subagents.map((agent) => agent.id)];
    scopeWhere = { assignedAgentProfileId: { in: visibleAgentIds } };
  } else {
    const agencyMemberships = await prisma.agencyMembership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { agencyId: true, role: true, agency: { select: { status: true } } },
    });
    const agencyIds = agencyMemberships.filter((membership) => membership.agency.status === "ACTIVE").map((membership) => membership.agencyId);
    if (!agencyIds.length) throw new ApiError(403, "LEAD_ACCESS_DENIED", "You do not have access to these enquiries.");
    scopeWhere = { agencyId: { in: agencyIds } };
  }
  const q = params.get("q")?.trim();
  const status = params.get("status");
  const assignee = params.get("assignee");
  const followUp = params.get("followUp");
  const now = new Date();
  const where: Prisma.EnquiryWhereInput = {
    AND: [scopeWhere,
      ...(q ? [{ OR: [
        { buyerName: { contains: q, mode: "insensitive" as const } },
        { buyerEmail: { contains: q, mode: "insensitive" as const } },
        { buyerPhone: { contains: q, mode: "insensitive" as const } },
        { message: { contains: q, mode: "insensitive" as const } },
        { property: { title: { contains: q, mode: "insensitive" as const } } },
        { agentProfile: { fullName: { contains: q, mode: "insensitive" as const } } },
        { assignedAgentProfile: { fullName: { contains: q, mode: "insensitive" as const } } },
      ] }] : []),
      ...(status && ["NEW", "CONTACTED", "QUALIFIED", "CLOSED_WON", "CLOSED_LOST", "SPAM"].includes(status) ? [{ status: status as "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED_WON" | "CLOSED_LOST" | "SPAM" }] : []),
      ...(assignee === "unassigned" ? [{ assignedAgentProfileId: null }] : assignee ? [{ assignedAgentProfileId: assignee }] : []),
      ...(followUp === "none" ? [{ followUpAt: null }] : followUp === "overdue" ? [{ followUpAt: { lt: now } }] : followUp === "due" ? [{ followUpAt: { gte: now, lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) } }] : []),
    ],
  };
  return where;
}

const leadListInclude = {
  property: { select: { id: true, title: true, slug: true } },
  agentProfile: { select: { id: true, fullName: true } },
  assignedAgentProfile: { select: { id: true, fullName: true } },
  activities: { orderBy: { createdAt: "desc" as const }, take: 30, include: { actorUser: { select: { name: true } } } },
};

export async function listLeads(user: CurrentUser, params = new URLSearchParams()) {
  const where = await leadListWhere(user, params);
  const totalItems = await prisma.enquiry.count({ where });
  const window = paginationWindow(totalItems, PAGE_SIZES.enquiries, requestedPage(params));
  const items = await prisma.enquiry.findMany({
    where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: window.skip, take: window.pageSize,
    include: leadListInclude,
  });
  return paginationEnvelope(items, window);
}

export async function getLeadDetailWithNavigation(user: CurrentUser, leadId: string, params = new URLSearchParams()) {
  const where = await leadListWhere(user, params);
  const scopeWhere = await leadListWhere(user, new URLSearchParams());
  const item = await prisma.enquiry.findFirst({ where: { AND: [scopeWhere, { id: leadId }] }, include: leadListInclude });
  if (!item) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
  const filteredWhere = { AND: [where] } satisfies Prisma.EnquiryWhereInput;
  const newerWhere = { AND: [filteredWhere, { OR: [{ createdAt: { gt: item.createdAt } }, { createdAt: item.createdAt, id: { gt: item.id } }] }] } satisfies Prisma.EnquiryWhereInput;
  const totalItems = await prisma.enquiry.count({ where: filteredWhere });
  const newerItems = await prisma.enquiry.count({ where: newerWhere });
  const currentIndex = newerItems;
  const [previous, next] = await Promise.all([
    currentIndex > 0 ? prisma.enquiry.findMany({ where: filteredWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: currentIndex - 1, take: 1, select: { id: true } }).then((items) => items[0] ?? null) : null,
    currentIndex + 1 < totalItems ? prisma.enquiry.findMany({ where: filteredWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: currentIndex + 1, take: 1, select: { id: true } }).then((items) => items[0] ?? null) : null,
  ]);
  return {
    item,
    totalItems,
    position: currentIndex + 1,
    previous: previous ? { id: previous.id, page: Math.floor((currentIndex - 1) / PAGE_SIZES.enquiries) + 1 } : null,
    next: next ? { id: next.id, page: Math.floor((currentIndex + 1) / PAGE_SIZES.enquiries) + 1 } : null,
  };
}

export async function updateLead(user: CurrentUser, leadId: string, input: {
  status?: "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED_WON" | "CLOSED_LOST" | "SPAM";
  assignedAgentProfileId?: string | null;
  followUpAt?: string | null;
  note?: string;
}) {
  const profile = await prisma.agentProfile.findUnique({
    where: { userId: user.id }, include: { subagents: { select: { id: true } } },
  });
  const agencyMemberships = await prisma.agencyMembership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { agencyId: true, role: true, agency: { select: { status: true } } },
  });
  const agencyIds = agencyMemberships.map((membership) => membership.agencyId);
  const agentIds = profile ? [profile.id, ...profile.subagents.map((agent) => agent.id)] : [];
  const scope = { OR: [...(agentIds.length ? [{ assignedAgentProfileId: { in: agentIds } }] : []), ...(agencyIds.length ? [{ agencyId: { in: agencyIds } }] : [])] };
  const lead = await prisma.enquiry.findFirst({ where: { id: leadId, ...scope } });
  if (!lead) throw new ApiError(404, "NOT_FOUND", "The requested record was not found.");
  const agencyAccess = agencyMemberships.some((membership) => membership.agencyId === lead.agencyId && membership.agency.status === "ACTIVE");
  const agentAccess = Boolean(profile && agentIds.some((id) => id === lead.assignedAgentProfileId));
  if (!agencyAccess && agentAccess) await requireActiveAgent(user);
  else if (!agencyAccess) throw new ApiError(403, "AGENCY_NOT_ACTIVE", "An active agency membership is required to update this enquiry.");

  const agencyMembership = agencyMemberships.find((membership) => membership.agencyId === lead.agencyId && membership.agency.status === "ACTIVE");
  if (input.assignedAgentProfileId !== undefined && (!agencyMembership || agencyMembership.role !== "AGENCY_ADMIN")) {
    throw new ApiError(403, "AGENCY_ADMIN_REQUIRED", "Only an agency administrator can assign enquiries.");
  }
  if (input.assignedAgentProfileId) {
    const assignee = await prisma.agentProfile.findFirst({
      where: { id: input.assignedAgentProfileId, agencyId: lead.agencyId, status: "ACTIVE", agency: { status: "ACTIVE" }, user: { emailVerified: true, isSuspended: false } },
      select: { id: true },
    });
    if (!assignee) throw new ApiError(400, "INVALID_ENQUIRY_ASSIGNEE", "Choose an active agent from this agency.");
  }
  const assignmentIds = [lead.assignedAgentProfileId, input.assignedAgentProfileId].filter((id): id is string => Boolean(id));
  const assignmentProfiles = assignmentIds.length ? await prisma.agentProfile.findMany({ where: { id: { in: assignmentIds } }, select: { id: true, fullName: true } }) : [];
  const assignmentName = (id: string | null | undefined) => assignmentProfiles.find((agent) => agent.id === id)?.fullName ?? "Unassigned";

  const nextFollowUp = input.followUpAt === undefined ? lead.followUpAt : input.followUpAt ? new Date(input.followUpAt) : null;
  if (input.followUpAt && Number.isNaN(nextFollowUp?.getTime())) throw new ApiError(400, "INVALID_FOLLOW_UP", "Choose a valid follow-up date.");
  return prisma.$transaction(async (tx) => {
    const data: { status?: typeof lead.status; assignedAgentProfileId?: string | null; followUpAt?: Date | null } = {};
    const activities: Array<{ action: string; note?: string; details?: Record<string, string | null> }> = [];
    if (input.status !== undefined && input.status !== lead.status) {
      data.status = input.status;
      activities.push({ action: "STATUS_CHANGED", details: { from: lead.status, to: input.status } });
      await appendAuditEvent(tx, { actorUserId: user.id, agencyId: lead.agencyId, action: "enquiry.status_changed", entityType: "Enquiry", entityId: lead.id, payload: { from: lead.status, to: input.status } });
    }
    if (input.assignedAgentProfileId !== undefined && input.assignedAgentProfileId !== lead.assignedAgentProfileId) {
      data.assignedAgentProfileId = input.assignedAgentProfileId;
      activities.push({ action: "ASSIGNED", details: { from: assignmentName(lead.assignedAgentProfileId), to: assignmentName(input.assignedAgentProfileId) } });
      await appendAuditEvent(tx, { actorUserId: user.id, agencyId: lead.agencyId, action: "enquiry.assigned", entityType: "Enquiry", entityId: lead.id, payload: { from: lead.assignedAgentProfileId, to: input.assignedAgentProfileId } });
    }
    if (input.followUpAt !== undefined && nextFollowUp?.getTime() !== lead.followUpAt?.getTime()) {
      data.followUpAt = nextFollowUp;
      activities.push({ action: nextFollowUp ? "FOLLOW_UP_SET" : "FOLLOW_UP_CLEARED", details: { at: nextFollowUp?.toISOString() ?? null } });
      await appendAuditEvent(tx, { actorUserId: user.id, agencyId: lead.agencyId, action: "enquiry.follow_up_changed", entityType: "Enquiry", entityId: lead.id, payload: { at: nextFollowUp?.toISOString() ?? null } });
    }
    if (input.note) activities.push({ action: "NOTE_ADDED", note: input.note });
    if (Object.keys(data).length) await tx.enquiry.update({ where: { id: lead.id }, data });
    for (const activity of activities) await tx.enquiryActivity.create({ data: { enquiryId: lead.id, actorUserId: user.id, ...activity } });
    const updated = await tx.enquiry.findUniqueOrThrow({ where: { id: lead.id } });
    return updated;
  });
}

