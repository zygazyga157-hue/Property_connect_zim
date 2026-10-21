CREATE TYPE "CardTermSource" AS ENUM ('PAYMENT', 'ADMIN_MINT');
CREATE TYPE "CardTermStatus" AS ENUM ('ACTIVE', 'REFUNDED');

ALTER TABLE "GoldCard"
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "durationDaysSnapshot" INTEGER;

UPDATE "GoldCard" AS card
SET "durationDaysSnapshot" = GREATEST(1, CEIL(EXTRACT(EPOCH FROM (card."expiresAt" - card."activatedAt")) / 86400.0)::INTEGER)
WHERE card."activatedAt" IS NOT NULL AND card."expiresAt" IS NOT NULL;

UPDATE "GoldCard" AS card
SET "durationDaysSnapshot" = plan."durationDays"
FROM "CardPlan" AS plan
WHERE card."durationDaysSnapshot" IS NULL AND plan."id" = card."planId";

ALTER TABLE "GoldCard" ALTER COLUMN "durationDaysSnapshot" SET NOT NULL;

ALTER TABLE "Payment"
  ADD COLUMN "payerAgencyId" TEXT,
  ADD COLUMN "targetAgentProfileId" TEXT,
  ADD COLUMN "cardId" TEXT,
  ADD COLUMN "termDays" INTEGER;

UPDATE "Payment" AS payment
SET "termDays" = plan."durationDays"
FROM "CardPlan" AS plan
WHERE plan."id" = payment."planId";

ALTER TABLE "Payment" ALTER COLUMN "termDays" SET NOT NULL;

UPDATE "Payment" AS payment
SET "cardId" = card."id"
FROM "GoldCard" AS card
WHERE card."paymentId" = payment."id";

CREATE TABLE "CardTerm" (
  "id" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "paymentId" TEXT,
  "source" "CardTermSource" NOT NULL,
  "status" "CardTermStatus" NOT NULL DEFAULT 'ACTIVE',
  "durationDays" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "refundedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CardTerm_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CardTerm" ("id", "cardId", "paymentId", "source", "status", "durationDays", "startsAt", "endsAt", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || card."id"),
  card."id",
  card."paymentId",
  CASE WHEN card."paymentId" IS NULL THEN 'ADMIN_MINT'::"CardTermSource" ELSE 'PAYMENT'::"CardTermSource" END,
  'ACTIVE'::"CardTermStatus",
  GREATEST(1, CEIL(EXTRACT(EPOCH FROM (card."expiresAt" - card."activatedAt")) / 86400.0)::INTEGER),
  card."activatedAt",
  card."expiresAt",
  card."activatedAt"
FROM "GoldCard" AS card
WHERE card."activatedAt" IS NOT NULL
  AND card."expiresAt" IS NOT NULL;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_payerAgencyId_fkey" FOREIGN KEY ("payerAgencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Payment_targetAgentProfileId_fkey" FOREIGN KEY ("targetAgentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Payment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "GoldCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CardTerm"
  ADD CONSTRAINT "CardTerm_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "GoldCard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CardTerm_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CardTerm_paymentId_key" ON "CardTerm"("paymentId");
CREATE INDEX "CardTerm_cardId_status_startsAt_idx" ON "CardTerm"("cardId", "status", "startsAt");
CREATE INDEX "CardTerm_endsAt_status_idx" ON "CardTerm"("endsAt", "status");
CREATE INDEX "Payment_payerAgencyId_status_createdAt_idx" ON "Payment"("payerAgencyId", "status", "createdAt");
CREATE INDEX "Payment_targetAgentProfileId_status_createdAt_idx" ON "Payment"("targetAgentProfileId", "status", "createdAt");
CREATE INDEX "Payment_cardId_status_createdAt_idx" ON "Payment"("cardId", "status", "createdAt");

ALTER TABLE "GoldCard" DROP CONSTRAINT "GoldCard_paymentId_fkey";
DROP INDEX "GoldCard_paymentId_key";
ALTER TABLE "GoldCard" DROP COLUMN "paymentId";

UPDATE "GoldCard"
SET "status" = 'EXPIRED'
WHERE "status" = 'ACTIVE'
  AND "expiresAt" IS NOT NULL
  AND "expiresAt" <= CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF EXISTS (
    SELECT "agentProfileId"
    FROM "GoldCard"
    WHERE "agentProfileId" IS NOT NULL
      AND "status"::text IN ('ASSIGNED', 'ACTIVE', 'SUSPENDED')
    GROUP BY "agentProfileId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple current Gold Cards exist for an agent. Reconcile those records before applying the card lifecycle migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "GoldCard_one_current_card_per_agent_idx"
  ON "GoldCard"("agentProfileId")
  WHERE "agentProfileId" IS NOT NULL AND "status" IN ('ASSIGNED', 'ACTIVE', 'SUSPENDED');
