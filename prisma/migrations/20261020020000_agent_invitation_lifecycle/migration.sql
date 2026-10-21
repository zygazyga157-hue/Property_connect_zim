ALTER TABLE "AgentInvitation"
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedByUserId" TEXT;

CREATE INDEX "AgentInvitation_agencyId_parentAgentId_createdAt_idx"
  ON "AgentInvitation"("agencyId", "parentAgentId", "createdAt");
