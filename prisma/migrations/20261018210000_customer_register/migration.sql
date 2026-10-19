CREATE TABLE IF NOT EXISTS "Customer" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reference" TEXT,
  "displayName" TEXT NOT NULL,
  "contactPerson" TEXT,
  "telephone" TEXT,
  "email" TEXT,
  "billingDetails" TEXT,
  "customerType" TEXT,
  "status" TEXT,
  "notes" TEXT,
  "archivedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Customer_displayName_nonempty" CHECK (length(trim("displayName")) > 0),
  CONSTRAINT "Customer_reference_nonempty" CHECK ("reference" IS NULL OR length(trim("reference")) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_companyId_reference_key" ON "Customer"("companyId", "reference");
CREATE INDEX IF NOT EXISTS "Customer_companyId_archivedAt_displayName_idx" ON "Customer"("companyId", "archivedAt", "displayName");
CREATE INDEX IF NOT EXISTS "Customer_companyId_customerType_idx" ON "Customer"("companyId", "customerType");

-- The base role catalog already seeds customer:manage for these four roles.
-- Add only the Dispatcher enquiry-context grant that was approved with CUS-01.
INSERT INTO "RolePermission" ("roleCode", "permission", "scope") VALUES
  ('DISPATCHER', 'customer:manage', 'ENQUIRY_CONTEXT')
ON CONFLICT ("roleCode", "permission", "scope") DO NOTHING;
