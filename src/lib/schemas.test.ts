import { describe, expect, it } from "vitest";
import {
  createInitialAdminSchema,
  emailAddress,
  leadUpdateSchema,
  passwordConfirmationSchema,
  phoneNumber,
} from "./schemas";

describe("account input validation", () => {
  it("normalizes and validates email addresses", () => {
    expect(emailAddress.parse("  Admin@Example.com ")).toBe("admin@example.com");
    expect(emailAddress.safeParse("not-an-email").success).toBe(false);
  });

  it("accepts valid E.164 phone numbers and rejects local or malformed numbers", () => {
    expect(phoneNumber.safeParse("+263771234567").success).toBe(true);
    expect(phoneNumber.safeParse("0771234567").success).toBe(false);
    expect(phoneNumber.safeParse("+9991234567").success).toBe(false);
  });

  it("requires a 12 character password and matching confirmation", () => {
    expect(passwordConfirmationSchema.safeParse({ password: "long-enough-pass", confirmPassword: "long-enough-pass" }).success).toBe(true);
    expect(passwordConfirmationSchema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(passwordConfirmationSchema.safeParse({ password: "long-enough-pass", confirmPassword: "different-pass" }).success).toBe(false);
  });

  it("validates the operator-created initial admin input", () => {
    expect(createInitialAdminSchema.safeParse({ name: "Platform Operator", email: "ADMIN@EXAMPLE.COM", password: "long-enough-pass", confirmPassword: "long-enough-pass" }).success).toBe(true);
    expect(createInitialAdminSchema.safeParse({ name: "Operator", email: "bad", password: "long-enough-pass", confirmPassword: "long-enough-pass" }).success).toBe(false);
  });
});

describe("enquiry workflow input validation", () => {
  it("accepts status, assignment, follow-up, and internal-note updates", () => {
    expect(leadUpdateSchema.safeParse({ status: "CONTACTED", assignedAgentProfileId: "clxxxxxxxxxxxxxxxxxxxxxxxx", followUpAt: "2026-10-22T09:00:00.000Z", note: "Called to arrange a viewing." }).success).toBe(true);
    expect(leadUpdateSchema.safeParse({ assignedAgentProfileId: null, followUpAt: null }).success).toBe(true);
  });

  it("rejects empty updates and invalid follow-up timestamps", () => {
    expect(leadUpdateSchema.safeParse({}).success).toBe(false);
    expect(leadUpdateSchema.safeParse({ followUpAt: "tomorrow morning" }).success).toBe(false);
    expect(leadUpdateSchema.safeParse({ note: "   " }).success).toBe(false);
  });
});
