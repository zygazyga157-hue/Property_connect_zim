import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { stdin, stdout } from "node:process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedAdminEmail } from "../prisma/seed-identity";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    if (await prisma.user.count({ where: { globalRole: "platform_admin" } })) throw new Error("A platform administrator already exists.");
    const [nameArg, emailArg] = process.argv.slice(2);
    const promptedName = nameArg ?? await prompt.question("Administrator account name [Platform Administrator]: ");
    const name = promptedName.trim() || "Platform Administrator";
    const promptedEmail = emailArg ?? await prompt.question(`Administrator account email [${seedAdminEmail}]: `);
    const email = (promptedEmail.trim() || seedAdminEmail).toLowerCase();
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a name and valid email address.");
    if (await prisma.user.findUnique({ where: { email } })) throw new Error("That email already has an account. Verify it, then use admin:bootstrap.");
    prompt.close();
    // The temporary credential is never displayed or persisted elsewhere.
    // The operator sets their own password through Better Auth's emailed reset flow.
    const temporaryPassword = randomBytes(48).toString("base64url");
    const appOrigin = new URL(appUrl).origin;
    const response = await fetch(new URL("/api/auth/sign-up/email", appUrl), {
      method: "POST", headers: { "content-type": "application/json", origin: appOrigin },
      body: JSON.stringify({ name, email, password: temporaryPassword, callbackURL: "/verify-email?verified=1&returnTo=%2Fregister%2Fagency" }),
    });
    const result = await response.json().catch(() => ({})) as { message?: string; error?: string };
    if (!response.ok) throw new Error(result.message ?? result.error ?? `Account creation failed with HTTP ${response.status}.`);
    const resetResponse = await fetch(new URL("/api/auth/request-password-reset", appUrl), {
      method: "POST", headers: { "content-type": "application/json", origin: appOrigin },
      body: JSON.stringify({ email, redirectTo: "/reset-password" }),
    });
    if (!resetResponse.ok) {
      console.warn("The account was created, but the password setup email could not be queued. Use /forgot-password after verifying the email.");
    }
    console.info(`Unprivileged account created for ${email}. Check the inbox for verification and password setup links. After verification, run: npm run admin:bootstrap -- ${email}`);
  } finally {
    prompt.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Initial administrator account creation failed.");
  console.error(error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
