CREATE TABLE "CorporateInvoice" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "subtotalPesewas" INTEGER NOT NULL,
  "taxPesewas" INTEGER NOT NULL,
  "totalPesewas" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CorporateInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CorporateInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CorporateInvoice_client_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CorporateInvoice_contract_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "Contract"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CorporateInvoice_status_allowed" CHECK ("status" IN ('DRAFT')),
  CONSTRAINT "CorporateInvoice_period_ordered" CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "CorporateInvoice_amounts_nonnegative" CHECK ("subtotalPesewas" >= 0 AND "taxPesewas" >= 0 AND "totalPesewas" >= 0),
  CONSTRAINT "CorporateInvoice_total_matches" CHECK ("totalPesewas" = "subtotalPesewas" + "taxPesewas")
);
CREATE UNIQUE INDEX "CorporateInvoice_companyId_id_key" ON "CorporateInvoice"("companyId", "id");
CREATE UNIQUE INDEX "CorporateInvoice_companyId_reference_key" ON "CorporateInvoice"("companyId", "reference");
CREATE UNIQUE INDEX "CorporateInvoice_companyId_contractId_periodStart_periodEnd_key"
  ON "CorporateInvoice"("companyId", "contractId", "periodStart", "periodEnd");
CREATE INDEX "CorporateInvoice_companyId_clientId_periodStart_idx" ON "CorporateInvoice"("companyId", "clientId", "periodStart");

CREATE TABLE "CorporateInvoiceLine" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "tripId" TEXT,
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "ratePesewas" INTEGER NOT NULL,
  "amountPesewas" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CorporateInvoiceLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CorporateInvoiceLine_invoice_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "CorporateInvoice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CorporateInvoiceLine_trip_fkey" FOREIGN KEY ("companyId", "tripId") REFERENCES "Trip"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CorporateInvoiceLine_unit_allowed" CHECK ("unit" IN ('PER_TRIP', 'PER_PASSENGER')),
  CONSTRAINT "CorporateInvoiceLine_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "CorporateInvoiceLine_amounts_nonnegative" CHECK ("ratePesewas" >= 0 AND "amountPesewas" >= 0),
  CONSTRAINT "CorporateInvoiceLine_amount_matches" CHECK ("amountPesewas" = "quantity" * "ratePesewas")
);
CREATE INDEX "CorporateInvoiceLine_companyId_invoiceId_idx" ON "CorporateInvoiceLine"("companyId", "invoiceId");

-- Duplicate-billing protection: one trip may be billed on exactly one invoice line.
CREATE UNIQUE INDEX "CorporateInvoiceLine_trip_unique"
  ON "CorporateInvoiceLine"("companyId", "tripId")
  WHERE "tripId" IS NOT NULL;

-- Append-only: invoice rows never change after creation in this slice.
CREATE FUNCTION prevent_corporate_invoice_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CorporateInvoice rows are immutable after creation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CorporateInvoice_immutable"
  BEFORE UPDATE OR DELETE ON "CorporateInvoice"
  FOR EACH ROW EXECUTE FUNCTION prevent_corporate_invoice_mutation();
CREATE FUNCTION prevent_corporate_invoice_line_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CorporateInvoiceLine rows are immutable after creation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CorporateInvoiceLine_immutable"
  BEFORE UPDATE OR DELETE ON "CorporateInvoiceLine"
  FOR EACH ROW EXECUTE FUNCTION prevent_corporate_invoice_line_mutation();
