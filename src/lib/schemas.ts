import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";

const eacNumber = z.string().trim().regex(/^EAC\/\d{4}\/\d{5}$/, "Use the format EAC/YYYY/NNNNN.");
export const emailAddress = z.string().trim().toLowerCase().pipe(z.email());
export const phoneNumber = z.string().trim()
  .regex(/^\+[1-9]\d{1,14}$/, "Use international E.164 format, for example +263771234567.")
  .refine((value) => parsePhoneNumberFromString(value)?.isValid() ?? false, "Enter a valid international phone number.");
export const passwordSchema = z.string().min(12, "Use at least 12 characters.").max(128, "Use no more than 128 characters.");

export const passwordConfirmationSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, {
  message: "Passwords do not match.", path: ["confirmPassword"],
});

export const createInitialAdminSchema = z.object({
  name: z.string().trim().min(2).max(140),
  email: emailAddress,
}).and(passwordConfirmationSchema);

export const resendVerificationSchema = z.object({ email: emailAddress });

export const agencyRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(140),
  eacRegistrationNumber: eacNumber,
  email: emailAddress,
  phone: phoneNumber,
  address: z.string().trim().max(500).optional(),
});

export const agentRegistrationSchema = z.object({
  invitationToken: z.string().trim().min(32).max(200),
  fullName: z.string().trim().min(2).max(140),
  eacRegistrationNumber: eacNumber,
  phone: phoneNumber,
  photoObjectKey: z.string().trim().min(1).max(500).optional(),
});

export const agentProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(140),
  phone: phoneNumber,
  bio: z.string().trim().max(2000).optional(),
  photoObjectKey: z.string().trim().min(1).max(500).optional(),
});

export const agentResubmissionSchema = z.object({
  fullName: z.string().trim().min(2).max(140),
  eacRegistrationNumber: eacNumber,
  phone: phoneNumber,
  photoObjectKey: z.string().trim().min(1).max(500).optional(),
});

export const agentInvitationSchema = z.object({
  email: emailAddress,
  expiresInDays: z.number().int().min(1).max(30).default(7),
  invitationType: z.enum(["agency", "subagent"]).optional(),
});
export const invitationLookupSchema = z.object({ invitationToken: z.string().trim().min(32).max(200), email: emailAddress });
export const invitationRevokeSchema = z.object({ reason: z.string().trim().min(4).max(500) });
export const agencyAgentStatusSchema = z.object({
  decision: z.enum(["suspend", "restore"]),
  notes: z.string().trim().min(4).max(2000),
});

export const reviewSchema = z.object({
  decision: z.enum(["approve", "reject", "suspend", "restore"]),
  notes: z.string().trim().max(2000).optional(),
}).refine((value) => value.decision === "approve" || (value.notes?.length ?? 0) >= 4, {
  message: "Enter a review reason of at least four characters.", path: ["notes"],
});

export const propertySchema = z.object({
  title: z.string().trim().min(5).max(180),
  description: z.string().trim().min(30).max(12_000),
  propertyType: z.enum(["HOUSE", "APARTMENT", "TOWNHOUSE", "LAND", "COMMERCIAL", "FARM", "OTHER"]),
  purpose: z.enum(["SALE", "RENT", "SHORT_STAY"]),
  priceAmount: z.coerce.number().positive().max(1_000_000_000).optional(),
  priceCurrency: z.string().trim().length(3).toUpperCase().optional(),
  bedrooms: z.number().int().min(0).max(100).optional(),
  bathrooms: z.number().int().min(0).max(100).optional(),
  floorAreaSqm: z.number().positive().max(10_000_000).optional(),
  landAreaSqm: z.number().positive().max(100_000_000).optional(),
  address: z.string().trim().max(300).optional(),
  suburb: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(120),
  province: z.string().trim().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  features: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  imageObjectKeys: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
});

export const enquirySchema = z.object({
  buyerName: z.string().trim().min(2).max(140),
  buyerEmail: emailAddress,
  buyerPhone: phoneNumber.optional(),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(0).optional(),
});

export const buyerProfileSchema = z.object({
  searchQuery: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  propertyType: z.enum(["HOUSE", "APARTMENT", "TOWNHOUSE", "LAND", "COMMERCIAL", "FARM", "OTHER"]).nullable().optional(),
  purpose: z.enum(["SALE", "RENT", "SHORT_STAY"]).nullable().optional(),
});

export const savedPropertySchema = z.object({ propertyId: z.string().cuid() });

export const leadUpdateSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CLOSED_WON", "CLOSED_LOST", "SPAM"]).optional(),
  assignedAgentProfileId: z.string().cuid().nullable().optional(),
  followUpAt: z.iso.datetime().nullable().optional(),
  note: z.string().trim().min(1).max(2000).optional(),
}).refine((value) => value.status !== undefined || value.assignedAgentProfileId !== undefined || value.followUpAt !== undefined || value.note !== undefined, {
  message: "Provide an enquiry update.",
});
export const agencyPropertyStatusSchema = z.object({ status: z.enum(["PUBLISHED", "ARCHIVED"]) });

export const checkoutSchema = z.object({
  planCode: z.string().trim().min(2).max(40),
  idempotencyKey: z.string().uuid(),
});

export const agencyCardCheckoutSchema = checkoutSchema.extend({
  agentProfileId: z.string().cuid().optional(),
});

export const activateCardSchema = z.object({
  serial: z.string().trim().min(8).max(64).toUpperCase(),
  code: z.string().trim().min(8).max(100),
});

export const mintCardSchema = z.object({
  planCode: z.string().trim().min(2).max(40),
  agentProfileId: z.string().cuid().optional(),
  agencyId: z.string().cuid().optional(),
  reason: z.string().trim().min(4).max(500),
});

export const assignAgencyCardSchema = z.object({
  agentProfileId: z.string().cuid(),
  reason: z.string().trim().min(4).max(500),
});

const cardActionReason = z.string().trim().min(4).max(500);
export const adminCardActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), agentProfileId: z.string().cuid(), reason: cardActionReason }),
  z.object({ action: z.literal("rotate_activation_code"), reason: cardActionReason }),
  z.object({ action: z.literal("suspend"), reason: cardActionReason }),
  z.object({ action: z.literal("restore"), reason: cardActionReason }),
  z.object({ action: z.literal("revoke"), reason: cardActionReason }),
]);

export const cardPlanSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,40}$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  durationDays: z.number().int().min(1).max(730),
  priceAmount: z.number().positive().max(100_000).optional(),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  priceApproved: z.boolean().default(false),
  status: z.enum(["DRAFT", "ACTIVE", "RETIRED"]).default("DRAFT"),
});

export const userStatusSchema = z.object({
  isSuspended: z.boolean(),
  reason: z.string().trim().min(4).max(500),
});

export const mediaUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  sizeBytes: z.number().int().positive().max(12 * 1024 * 1024),
});

export type PropertyInput = z.infer<typeof propertySchema>;
