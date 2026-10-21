import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { auditDigest } from "../src/lib/audit/canonical";
import { seedAdminEmail } from "./seed-identity";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

// Fill these values after creating the named accounts through the app. The CEO
// account must already exist; this seed deliberately does not create passwords
// or Better Auth credential records.
const sentinelSeed = {
  adminEmail: seedAdminEmail,
  agency: {
    name: "Sentinel X",
    eacRegistrationNumber: "EAC-AGN-2026-0041",
    email: "sentinelx@admin.com",
    phone: "+263 772 123 4577",
    address: "123 Sentinel Street, Harare, Zimbabwe",
  },
  ceo: {
    name: "Mthokozisi Sapuwa",
    email: "mthosapuwa@gmail.com",
    phone: "+263 772 123 4567",
    eacRegistrationNumber: "EAC/2026/0042",
  },
  cardSerial: "PCZ-SEED-SENTINELX-CEO-001",
} as const;

const plans = [
  { code: "MONTHLY-30", name: "Monthly Gold Card", durationDays: 30 },
  { code: "ANNUAL-365", name: "Annual Gold Card", durationDays: 365 },
];

function isFilled(value: string): boolean {
  return value.trim().length > 0 && !value.startsWith("FILL_IN_");
}

function sentinelDetailsAreFilled(): boolean {
  return [
    sentinelSeed.adminEmail,
    sentinelSeed.agency.eacRegistrationNumber,
    sentinelSeed.agency.email,
    sentinelSeed.agency.phone,
    sentinelSeed.agency.address,
    sentinelSeed.ceo.email,
    sentinelSeed.ceo.phone,
    sentinelSeed.ceo.eacRegistrationNumber,
  ].every(isFilled);
}

async function appendSeedAudit(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string;
    agencyId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Prisma.InputJsonValue;
  },
) {
  await tx.$executeRaw`INSERT INTO "AuditChainHead" ("id", "sequence", "lastHash", "updatedAt") VALUES ('global', 0, '', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`;
  const [head] = await tx.$queryRaw<Array<{ sequence: bigint; lastHash: string }>>`
    SELECT "sequence", "lastHash" FROM "AuditChainHead" WHERE "id" = 'global' FOR UPDATE
  `;
  if (!head) throw new Error("AUDIT_CHAIN_HEAD_MISSING");

  const event = {
    sequence: head.sequence + 1n,
    previousHash: head.lastHash,
    occurredAt: new Date(),
    actorUserId: input.actorUserId,
    agencyId: input.agencyId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload,
  };
  const hash = auditDigest(event);
  await tx.auditEvent.create({ data: { ...event, hash } });
  await tx.auditChainHead.update({ where: { id: "global" }, data: { sequence: event.sequence, lastHash: hash } });
}

async function main() {
  for (const plan of plans) {
    await prisma.cardPlan.upsert({
      where: { code: plan.code },
      update: {},
      create: {
        ...plan,
        description: "Digital Gold Card access for one named professional seat.",
        priceAmount: null,
        currency: "USD",
        priceApproved: false,
        status: "ACTIVE",
      },
    });
  }
  console.info("Seeded configurable card plans. Checkout remains closed until pricing is approved.");

  if (!sentinelDetailsAreFilled()) {
    console.info("Sentinel X fixture skipped. Fill the FILL_IN_ values in prisma/seed.ts, create and verify the CEO account, bootstrap the administrator, then rerun npm run db:seed.");
    return;
  }

  const admin = await prisma.user.findUnique({ where: { email: sentinelSeed.adminEmail.toLowerCase() } });
  if (!admin || admin.globalRole !== "platform_admin" || !admin.emailVerified || admin.isSuspended) {
    throw new Error("The configured admin must be an existing, verified, active platform administrator. Sign up and run admin:bootstrap first.");
  }
  const ceo = await prisma.user.findUnique({ where: { email: sentinelSeed.ceo.email.toLowerCase() } });
  if (!ceo || !ceo.emailVerified || ceo.isSuspended) {
    throw new Error("The configured CEO must be an existing, verified, active Better Auth account. Create and verify the account first.");
  }

  await prisma.$transaction(async (tx) => {
    const existingAgency = await tx.agency.findUnique({
      where: { eacRegistrationNumber: sentinelSeed.agency.eacRegistrationNumber.toUpperCase() },
      select: { id: true },
    });
    const agency = await tx.agency.upsert({
      where: { eacRegistrationNumber: sentinelSeed.agency.eacRegistrationNumber.toUpperCase() },
      update: {},
      create: {
        name: sentinelSeed.agency.name,
        eacRegistrationNumber: sentinelSeed.agency.eacRegistrationNumber.toUpperCase(),
        email: sentinelSeed.agency.email.toLowerCase(),
        phone: sentinelSeed.agency.phone,
        address: sentinelSeed.agency.address,
        status: "ACTIVE",
        reviewNotes: "Seeded as an approved development fixture.",
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
      },
    });
    if (!existingAgency) {
      await appendSeedAudit(tx, {
        actorUserId: admin.id, agencyId: agency.id, action: "agency.seeded_approved",
        entityType: "Agency", entityId: agency.id,
        payload: { name: agency.name, eacRegistrationNumber: agency.eacRegistrationNumber },
      });
    }

    await tx.agencyMembership.upsert({
      where: { agencyId_userId: { agencyId: agency.id, userId: ceo.id } },
      update: {},
      create: { agencyId: agency.id, userId: ceo.id, role: "AGENCY_ADMIN", status: "ACTIVE" },
    });

    const existingAgent = await tx.agentProfile.findUnique({ where: { userId: ceo.id }, select: { id: true } });
    const agent = await tx.agentProfile.upsert({
      where: { userId: ceo.id },
      update: {},
      create: {
        userId: ceo.id,
        agencyId: agency.id,
        fullName: sentinelSeed.ceo.name,
        phone: sentinelSeed.ceo.phone,
        eacRegistrationNumber: sentinelSeed.ceo.eacRegistrationNumber.toUpperCase(),
        status: "ACTIVE",
        reviewNotes: "Seeded as an approved development fixture.",
        reviewedAt: new Date(),
        reviewedByUserId: admin.id,
      },
    });
    await tx.user.update({ where: { id: ceo.id }, data: { name: sentinelSeed.ceo.name } });
    if (!existingAgent) {
      await appendSeedAudit(tx, {
        actorUserId: admin.id, agencyId: agency.id, action: "agent.seeded_approved",
        entityType: "AgentProfile", entityId: agent.id,
        payload: { fullName: agent.fullName, eacRegistrationNumber: agent.eacRegistrationNumber },
      });
    }

    const annualPlan = await tx.cardPlan.findUniqueOrThrow({ where: { code: "ANNUAL-365" } });
    const existingCard = await tx.goldCard.findUnique({ where: { serial: sentinelSeed.cardSerial }, select: { id: true } });
    const card = await tx.goldCard.upsert({
      where: { serial: sentinelSeed.cardSerial },
      update: {},
      create: {
        serial: sentinelSeed.cardSerial,
        planId: annualPlan.id,
        ownerUserId: ceo.id,
        agentProfileId: agent.id,
        agencyId: agency.id,
        issuedByUserId: admin.id,
        status: "ACTIVE",
        activatedAt: new Date(),
        expiresAt: new Date(Date.now() + annualPlan.durationDays * 86_400_000),
      },
    });
    if (!existingCard) {
      await appendSeedAudit(tx, {
        actorUserId: admin.id, agencyId: agency.id, action: "card.seeded_active",
        entityType: "GoldCard", entityId: card.id,
        payload: { serial: card.serial, planCode: annualPlan.code, ownerUserId: ceo.id, agentProfileId: agent.id },
      });
    }
  });

  console.info(`Seeded Sentinel X, CEO agent ${sentinelSeed.ceo.name}, and active card ${sentinelSeed.cardSerial}.`);
}

main()
  .catch((error) => {
    console.error("Database seed failed.");
    console.error(error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
