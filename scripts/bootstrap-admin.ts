import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { auditDigest } from "../src/lib/audit/canonical";

const email = process.argv[2]?.trim().toLowerCase();
async function main(): Promise<void> {
  if (!email) {
    console.error("Usage: npm run admin:bootstrap -- administrator@example.com");
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to bootstrap an administrator.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("Create and verify the named account before bootstrapping it.");
    if (!user.emailVerified) throw new Error("Verify the account email before bootstrapping it.");
    if (user.isSuspended) throw new Error("A suspended account cannot become a platform administrator.");
    if (user.globalRole !== "platform_admin") {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('INSERT INTO "AuditChainHead" ("id", "sequence", "lastHash", "updatedAt") VALUES (\'global\', 0, \'\', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING');
        const heads = await tx.$queryRawUnsafe('SELECT "sequence", "lastHash" FROM "AuditChainHead" WHERE "id" = \'global\' FOR UPDATE') as Array<{ sequence: bigint; lastHash: string }>;
        const admins = await tx.user.count({ where: { globalRole: "platform_admin" } });
        if (admins) throw new Error("A platform administrator already exists. Bootstrap is allowed only once.");
        await tx.user.update({ where: { id: user.id }, data: { globalRole: "platform_admin" } });
        const previousHash = heads[0]?.lastHash ?? "";
        const sequence = (heads[0]?.sequence ?? 0n) + 1n;
        const occurredAt = new Date();
        const input = {
          sequence, previousHash, occurredAt, actorUserId: user.id, agencyId: null,
          action: "platform_admin.bootstrapped", entityType: "User", entityId: user.id,
          payload: { email: user.email },
        };
        const hash = auditDigest(input);
        await tx.auditEvent.create({ data: { ...input, hash } });
        await tx.auditChainHead.update({ where: { id: "global" }, data: { sequence, lastHash: hash } });
      });
    }
    console.info("Named platform administrator role assigned. Sign in and enable authenticator MFA before opening the admin workspace.");
  } catch (error) {
    console.error("Administrator bootstrap failed.");
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Administrator bootstrap failed.");
  console.error(error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
