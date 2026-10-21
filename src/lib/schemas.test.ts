import { describe, expect, it } from "vitest";
import {
  createInitialAdminSchema,
  emailAddress,
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
