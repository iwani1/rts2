-- Phase 5 (D-090/5B): customer quotations issued from pricing worksheets.
-- Snapshots the worksheet version, the pre-tax subtotal, the configured tax
-- lines and the total. One live (ISSUED) quotation per request via a partial
-- unique index; superseded/accepted/declined quotes stay as history.

CREATE UNIQUE INDEX "RentalPricingWorksheet_companyId_id_key" ON "RentalPricingWorksheet"("companyId", "id");

CREATE TABLE "RentalQuotation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "worksheetId" TEXT NOT NULL,
  "worksheetVersion" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ISSUED',
  "subtotalPesewas" BIGINT NOT NULL,
  "taxPesewas" BIGINT NOT NULL,
  "taxSnapshot" JSONB,
  "totalPesewas" BIGINT NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "decidedAt" TIMESTAMPTZ(6),
  "decisionReason" VARCHAR(500),
  "decidedById" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "RentalQuotation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalQuotation_status_allowed" CHECK ("status" IN ('ISSUED', 'ACCEPTED', 'DECLINED', 'SUPERSEDED')),
  CONSTRAINT "RentalQuotation_amounts_consistent" CHECK (
    "subtotalPesewas" >= 0 AND "taxPesewas" >= 0
    AND "totalPesewas" = "subtotalPesewas" + "taxPesewas"
  ),
  CONSTRAINT "RentalQuotation_decision_shape" CHECK (
    ("status" = 'ISSUED' AND "decidedAt" IS NULL AND "decidedById" IS NULL)
    OR ("status" IN ('ACCEPTED', 'DECLINED') AND "decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL)
    OR ("status" = 'SUPERSEDED')
  )
);

CREATE UNIQUE INDEX "RentalQuotation_companyId_id_key" ON "RentalQuotation"("companyId", "id");
CREATE UNIQUE INDEX "RentalQuotation_companyId_reference_key" ON "RentalQuotation"("companyId", "reference");
CREATE UNIQUE INDEX "RentalQuotation_one_live_per_request"
  ON "RentalQuotation"("companyId", "requestId") WHERE ("status" = 'ISSUED');
CREATE INDEX "RentalQuotation_companyId_requestId_status_idx" ON "RentalQuotation"("companyId", "requestId", "status");

ALTER TABLE "RentalQuotation"
  ADD CONSTRAINT "RentalQuotation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalQuotation"
  ADD CONSTRAINT "RentalQuotation_company_request_fkey"
  FOREIGN KEY ("companyId", "requestId") REFERENCES "RentalRequest"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalQuotation"
  ADD CONSTRAINT "RentalQuotation_company_worksheet_fkey"
  FOREIGN KEY ("companyId", "worksheetId") REFERENCES "RentalPricingWorksheet"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalQuotation"
  ADD CONSTRAINT "RentalQuotation_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
