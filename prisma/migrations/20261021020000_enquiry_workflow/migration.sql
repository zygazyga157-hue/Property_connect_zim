ALTER TABLE "Enquiry"
  ADD COLUMN "assignedAgentProfileId" TEXT,
  ADD COLUMN "followUpAt" TIMESTAMP(3);

UPDATE "Enquiry"
SET "assignedAgentProfileId" = "agentProfileId";

CREATE INDEX "Enquiry_assignedAgentProfileId_status_createdAt_idx"
  ON "Enquiry"("assignedAgentProfileId", "status", "createdAt");
CREATE INDEX "Enquiry_agencyId_followUpAt_idx"
  ON "Enquiry"("agencyId", "followUpAt");

ALTER TABLE "Enquiry"
  ADD CONSTRAINT "Enquiry_assignedAgentProfileId_fkey"
  FOREIGN KEY ("assignedAgentProfileId") REFERENCES "AgentProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EnquiryActivity" (
  "id" TEXT NOT NULL,
  "enquiryId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnquiryActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EnquiryActivity_enquiryId_createdAt_idx"
  ON "EnquiryActivity"("enquiryId", "createdAt");
CREATE INDEX "EnquiryActivity_actorUserId_createdAt_idx"
  ON "EnquiryActivity"("actorUserId", "createdAt");

ALTER TABLE "EnquiryActivity"
  ADD CONSTRAINT "EnquiryActivity_enquiryId_fkey"
  FOREIGN KEY ("enquiryId") REFERENCES "Enquiry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EnquiryActivity_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
