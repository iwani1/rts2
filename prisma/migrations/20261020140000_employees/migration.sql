CREATE TABLE "Employee" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "reference" TEXT,
  "fullName" TEXT NOT NULL,
  "telephone" TEXT,
  "email" TEXT,
  "homeAddress" TEXT,
  "department" TEXT,
  "workLocation" TEXT,
  "shift" TEXT,
  "approvedPickupLocation" TEXT,
  "approvedDropoffLocation" TEXT,
  "accountStatus" TEXT,
  "transportEligible" BOOLEAN,
  "accessibilityNeeds" TEXT,
  "notes" TEXT,
  "archivedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Employee_client_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Employee_fullName_nonempty" CHECK (length(trim("fullName")) > 0)
);
CREATE UNIQUE INDEX "Employee_companyId_id_key" ON "Employee"("companyId", "id");
CREATE UNIQUE INDEX "Employee_companyId_reference_key" ON "Employee"("companyId", "reference");
CREATE INDEX "Employee_companyId_archivedAt_fullName_idx" ON "Employee"("companyId", "archivedAt", "fullName");
CREATE INDEX "Employee_companyId_clientId_archivedAt_idx" ON "Employee"("companyId", "clientId", "archivedAt");
