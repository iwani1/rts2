CREATE TABLE "Driver" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "licenceClass" TEXT,
  "licenceExpiresAt" DATE,
  "qualifications" TEXT,
  "availability" TEXT,
  "status" TEXT,
  "archivedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Driver_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Driver_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Driver_name_nonempty" CHECK (length(trim("fullName")) > 0)
);
CREATE INDEX "Driver_companyId_archivedAt_fullName_idx" ON "Driver"("companyId", "archivedAt", "fullName");
CREATE INDEX "Driver_companyId_licenceExpiresAt_idx" ON "Driver"("companyId", "licenceExpiresAt");
