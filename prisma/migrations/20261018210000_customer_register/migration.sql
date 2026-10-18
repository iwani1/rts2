CREATE TABLE "Customer" (
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
CREATE UNIQUE INDEX "Customer_companyId_reference_key" ON "Customer"("companyId", "reference");
CREATE INDEX "Customer_companyId_archivedAt_displayName_idx" ON "Customer"("companyId", "archivedAt", "displayName");
CREATE INDEX "Customer_companyId_customerType_idx" ON "Customer"("companyId", "customerType");

-- Add customer-specific grants to the approved role matrix.
INSERT INTO "RolePermission" ("roleCode", "permission", "scope") VALUES
  ('SUPER_ADMIN', 'customer:manage', 'GLOBAL'),
  ('OPS_MANAGER', 'customer:manage', 'COMPANY'),
  ('DISPATCHER', 'customer:manage', 'ENQUIRY_CONTEXT'),
  ('RENTAL_CUSTOMER', 'customer:manage', 'OWN_PROFILE'),
  ('FINANCE_OFFICER', 'customer:manage', 'BILLING_CONTEXT');
