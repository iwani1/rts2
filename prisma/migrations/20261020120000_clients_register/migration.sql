CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "registrationDetails" TEXT,
  "contactPerson" TEXT,
  "telephone" TEXT,
  "email" TEXT,
  "billingAddress" TEXT,
  "status" TEXT,
  "notes" TEXT,
  "archivedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Client_companyId_id_key" ON "Client"("companyId", "id");
CREATE INDEX "Client_companyId_archivedAt_name_idx" ON "Client"("companyId", "archivedAt", "name");
