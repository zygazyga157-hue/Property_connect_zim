import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";
import { env, requireConfig } from "@/lib/env";
import { prisma } from "@/lib/db";
import { sendEmail, type EmailTemplate } from "@/lib/email";

export const auth = betterAuth({
  appName: "Property Connect",
  baseURL: env.appUrl,
  basePath: "/api/auth",
  secret: requireConfig(env.authSecret, "BETTER_AUTH_SECRET"),
  trustedOrigins: [env.appUrl],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const template: EmailTemplate = {
        eyebrow: "ACCOUNT RECOVERY",
        preheader: "Choose a new password for your Property Connect account.",
        title: "Reset your password",
        greeting: `Hello ${user.name},`,
        paragraphs: ["We received a request to change the password for your Property Connect account. Use the secure button below to choose a new password."],
        action: { label: "Choose a new password", url },
        note: "If you did not request a password reset, you can ignore this message. Your current password will remain unchanged.",
      };
      await sendEmail({
        to: user.email,
        subject: "Reset your Property Connect password",
        text: `Hello ${user.name},\n\nWe received a request to change the password for your Property Connect account. Use this secure link to choose a new password:\n\n${url}\n\nIf you did not request a password reset, you can ignore this message. Your current password will remain unchanged.`,
        template,
      }, { required: true });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      const template: EmailTemplate = {
        eyebrow: "ACCOUNT VERIFICATION",
        preheader: "Confirm your email address to finish setting up your account.",
        title: "Verify your email address",
        greeting: `Hello ${user.name},`,
        paragraphs: ["Confirm that this email address belongs to you. Once verified, you can continue to your buyer, agent, agency, or platform workspace."],
        action: { label: "Verify email address", url },
        note: "If you did not create a Property Connect account, you can ignore this message.",
      };
      await sendEmail({
        to: user.email,
        subject: "Verify your Property Connect email",
        text: `Hello ${user.name},\n\nConfirm that this email address belongs to you using this secure link:\n\n${url}\n\nIf you did not create a Property Connect account, you can ignore this message.`,
        template,
      }, { required: true });
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  user: {
    additionalFields: {
      globalRole: {
        type: "string",
        required: false,
        defaultValue: "buyer",
        input: false,
      },
      isSuspended: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60 * 4,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: {
    database: { generateId: "uuid" },
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
    },
  },
  plugins: [twoFactor({ issuer: "Property Connect Zimbabwe" })],
});

export type AuthSession = typeof auth.$Infer.Session;
