DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AgencyMembership"
    GROUP BY "userId"
    HAVING COUNT(DISTINCT "agencyId") > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one agency membership per account: some users belong to multiple agencies. Review AgencyMembership rows and retry this migration.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Enquiry" e
    LEFT JOIN "User" u ON u."id" = e."buyerUserId"
    WHERE e."buyerUserId" IS NOT NULL AND u."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add Enquiry buyer ownership: some buyerUserId values do not reference a User. Review those records and retry this migration.';
  END IF;
END $$;

CREATE TABLE "BuyerProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "searchQuery" TEXT,
  "city" TEXT,
  "propertyType" "PropertyType",
  "purpose" "ListingPurpose",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedProperty" (
  "id" TEXT NOT NULL,
  "buyerUserId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedProperty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyerProfile_userId_key" ON "BuyerProfile"("userId");
CREATE UNIQUE INDEX "SavedProperty_buyerUserId_propertyId_key" ON "SavedProperty"("buyerUserId", "propertyId");
CREATE INDEX "SavedProperty_buyerUserId_createdAt_idx" ON "SavedProperty"("buyerUserId", "createdAt");
CREATE UNIQUE INDEX "AgencyMembership_userId_key" ON "AgencyMembership"("userId");
CREATE INDEX "Enquiry_buyerUserId_createdAt_idx" ON "Enquiry"("buyerUserId", "createdAt");

ALTER TABLE "Enquiry"
  ADD CONSTRAINT "Enquiry_buyerUserId_fkey"
  FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BuyerProfile"
  ADD CONSTRAINT "BuyerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedProperty"
  ADD CONSTRAINT "SavedProperty_buyerUserId_fkey"
  FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SavedProperty_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
