import "server-only";

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import type { buyerProfileSchema } from "@/lib/schemas";
import type { z } from "zod";

type BuyerProfileInput = z.infer<typeof buyerProfileSchema>;

export async function getBuyerProfile(userId: string) {
  const profile = await prisma.buyerProfile.findUnique({ where: { userId } });
  return profile ?? { searchQuery: null, city: null, propertyType: null, purpose: null };
}

export async function updateBuyerProfile(userId: string, input: BuyerProfileInput) {
  return prisma.buyerProfile.upsert({
    where: { userId },
    create: { userId, searchQuery: input.searchQuery || null, city: input.city || null, propertyType: input.propertyType || null, purpose: input.purpose || null },
    update: { searchQuery: input.searchQuery || null, city: input.city || null, propertyType: input.propertyType || null, purpose: input.purpose || null },
  });
}

export async function listSavedProperties(userId: string) {
  return prisma.savedProperty.findMany({
    where: { buyerUserId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      property: {
        select: {
          id: true, slug: true, title: true, propertyType: true, purpose: true, city: true, suburb: true,
          priceAmount: true, priceCurrency: true, bedrooms: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1, select: { publicUrl: true, altText: true } },
        },
      },
    },
  });
}

export async function saveProperty(userId: string, propertyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, status: "PUBLISHED", agentProfile: { status: "ACTIVE", agency: { status: "ACTIVE" } } },
    select: { id: true },
  });
  if (!property) throw new ApiError(404, "NOT_FOUND", "This property is not available to save.");
  return prisma.savedProperty.upsert({
    where: { buyerUserId_propertyId: { buyerUserId: userId, propertyId } },
    create: { buyerUserId: userId, propertyId },
    update: {},
    select: { propertyId: true, createdAt: true },
  });
}

export async function isPropertySaved(userId: string, propertyId: string) {
  const saved = await prisma.savedProperty.findUnique({
    where: { buyerUserId_propertyId: { buyerUserId: userId, propertyId } },
    select: { propertyId: true },
  });
  return Boolean(saved);
}

export async function removeSavedProperty(userId: string, propertyId: string) {
  await prisma.savedProperty.deleteMany({ where: { buyerUserId: userId, propertyId } });
  return { removed: true };
}

export async function listBuyerEnquiries(userId: string) {
  return prisma.enquiry.findMany({
    where: { buyerUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, buyerName: true, buyerEmail: true, buyerPhone: true, message: true, status: true, createdAt: true,
      property: { select: { id: true, slug: true, title: true, city: true, suburb: true } },
      agentProfile: { select: { fullName: true, agency: { select: { name: true } } } },
    },
  });
}
