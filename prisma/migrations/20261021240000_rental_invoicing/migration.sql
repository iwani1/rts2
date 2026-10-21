-- Phase 5 (D-090/5A): governed rental invoices from approved completions.
-- Mirrors the corporate-invoice guard pattern (D-061): statuses constrained,
-- payments and history append-only, financial fields immutable, every
-- status change requires a matching history row (deferred to txn end).
-- One non-VOID invoice per rental request via a partial unique index
-- (index predicates cannot contain subqueries; status is a plain column).

CREATE UNIQUE INDEX "RentalCompletion_companyId_id_key" ON "RentalCompletion"("companyId", "id");

CREATE TABLE "RentalInvoice" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "completionId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "subtotalPesewas" INTEGER NOT NULL,
  "taxPesewas" INTEGER NOT NULL,
  "depositDeductionPesewas" INTEGER NOT NULL DEFAULT 0,
  "totalPesewas" INTEGER NOT NULL,
  "dueDate" DATE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "RentalInvoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalInvoice_status_allowed" CHECK ("status" IN ('DRAFT', 'ISSUED', 'PAID', 'VOID')),
  CONSTRAINT "RentalInvoice_amounts_consistent" CHECK (
    "subtotalPesewas" >= 0 AND "taxPesewas" >= 0 AND "depositDeductionPesewas" >= 0
    AND "totalPesewas" = "subtotalPesewas" + "taxPesewas" - "depositDeductionPesewas"
    AND "totalPesewas" >= 0
  )
);

CREATE UNIQUE INDEX "RentalInvoice_companyId_id_key" ON "RentalInvoice"("companyId", "id");
CREATE UNIQUE INDEX "RentalInvoice_companyId_reference_key" ON "RentalInvoice"("companyId", "reference");
CREATE UNIQUE INDEX "RentalInvoice_one_live_invoice_per_request"
  ON "RentalInvoice"("companyId", "requestId") WHERE ("status" <> 'VOID');
CREATE INDEX "RentalInvoice_companyId_requestId_idx" ON "RentalInvoice"("companyId", "requestId");
CREATE INDEX "RentalInvoice_companyId_status_createdAt_idx" ON "RentalInvoice"("companyId", "status", "createdAt");

ALTER TABLE "RentalInvoice"
  ADD CONSTRAINT "RentalInvoice_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalInvoice"
  ADD CONSTRAINT "RentalInvoice_company_request_fkey"
  FOREIGN KEY ("companyId", "requestId") REFERENCES "RentalRequest"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalInvoice"
  ADD CONSTRAINT "RentalInvoice_company_completion_fkey"
  FOREIGN KEY ("companyId", "completionId") REFERENCES "RentalCompletion"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RentalInvoiceLine" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "description" VARCHAR(300) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "ratePesewas" INTEGER NOT NULL,
  "amountPesewas" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RentalInvoiceLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalInvoiceLine_invoice_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "RentalInvoice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RentalInvoiceLine_companyId_invoiceId_createdAt_idx" ON "RentalInvoiceLine"("companyId", "invoiceId", "createdAt");

CREATE TABLE "RentalInvoicePayment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amountPesewas" INTEGER NOT NULL,
  "method" VARCHAR(64),
  "reference" VARCHAR(128),
  "receivedAt" DATE NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "recordedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RentalInvoicePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalInvoicePayment_invoice_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "RentalInvoice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalInvoicePayment_recordedBy_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalInvoicePayment_amount_positive" CHECK ("amountPesewas" > 0)
);
CREATE INDEX "RentalInvoicePayment_companyId_invoiceId_createdAt_idx" ON "RentalInvoicePayment"("companyId", "invoiceId", "createdAt");

CREATE TABLE "RentalInvoiceStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RentalInvoiceStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalInvoiceStatusHistory_invoice_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "RentalInvoice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalInvoiceStatusHistory_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalInvoiceStatusHistory_to_status_allowed" CHECK ("toStatus" IN ('DRAFT', 'ISSUED', 'PAID', 'VOID')),
  CONSTRAINT "RentalInvoiceStatusHistory_transition_allowed" CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'DRAFT')
    OR ("fromStatus" = 'DRAFT' AND "toStatus" IN ('ISSUED', 'VOID'))
    OR ("fromStatus" = 'ISSUED' AND "toStatus" IN ('PAID', 'VOID'))
  )
);
CREATE UNIQUE INDEX "RentalInvoiceStatusHistory_companyId_invoiceId_sequence_key"
  ON "RentalInvoiceStatusHistory"("companyId", "invoiceId", "sequence");
CREATE INDEX "RentalInvoiceStatusHistory_companyId_invoiceId_createdAt_idx"
  ON "RentalInvoiceStatusHistory"("companyId", "invoiceId", "createdAt");

CREATE FUNCTION prevent_rental_invoice_payment_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RentalInvoicePayment rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalInvoicePayment_immutable"
  BEFORE UPDATE OR DELETE ON "RentalInvoicePayment"
  FOR EACH ROW EXECUTE FUNCTION prevent_rental_invoice_payment_mutation();

CREATE FUNCTION prevent_rental_invoice_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RentalInvoiceStatusHistory rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalInvoiceStatusHistory_immutable"
  BEFORE UPDATE OR DELETE ON "RentalInvoiceStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_rental_invoice_history_mutation();

CREATE FUNCTION enforce_rental_invoice_creation() RETURNS trigger AS $$
BEGIN
  IF NEW."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'RentalInvoices must be created as DRAFT';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalInvoice_creation_guard"
  BEFORE INSERT ON "RentalInvoice"
  FOR EACH ROW EXECUTE FUNCTION enforce_rental_invoice_creation();

CREATE FUNCTION enforce_rental_invoice_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RentalInvoice rows cannot be deleted';
  END IF;
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."requestId" IS DISTINCT FROM OLD."requestId"
    OR NEW."completionId" IS DISTINCT FROM OLD."completionId"
    OR NEW."reference" IS DISTINCT FROM OLD."reference"
    OR NEW."subtotalPesewas" IS DISTINCT FROM OLD."subtotalPesewas"
    OR NEW."taxPesewas" IS DISTINCT FROM OLD."taxPesewas"
    OR NEW."depositDeductionPesewas" IS DISTINCT FROM OLD."depositDeductionPesewas"
    OR NEW."totalPesewas" IS DISTINCT FROM OLD."totalPesewas"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'RentalInvoice financial and identity fields are immutable';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'DRAFT' AND NEW."status" IN ('ISSUED', 'VOID'))
      OR (OLD."status" = 'ISSUED' AND NEW."status" IN ('PAID', 'VOID'))
    ) THEN
      RAISE EXCEPTION 'RentalInvoice status transition is not approved';
    END IF;
    IF NEW."status" = 'VOID' AND EXISTS (
      SELECT 1 FROM "RentalInvoicePayment"
      WHERE "companyId" = NEW."companyId" AND "invoiceId" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'An invoice with recorded payments cannot be voided';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalInvoice_change_guard"
  BEFORE UPDATE OR DELETE ON "RentalInvoice"
  FOR EACH ROW EXECUTE FUNCTION enforce_rental_invoice_change();

CREATE FUNCTION verify_rental_invoice_status_history() RETURNS trigger AS $$
DECLARE
  expected_from TEXT;
  expected_to TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    expected_from := NULL;
    expected_to := NEW."status";
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    expected_from := OLD."status";
    expected_to := NEW."status";
  ELSE
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "RentalInvoiceStatusHistory"
    WHERE "companyId" = NEW."companyId"
      AND "invoiceId" = NEW."id"
      AND "fromStatus" IS NOT DISTINCT FROM expected_from
      AND "toStatus" = expected_to
  ) THEN
    RAISE EXCEPTION 'Every rental invoice status change requires status history';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "RentalInvoice_status_history_required"
  AFTER INSERT OR UPDATE ON "RentalInvoice"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_rental_invoice_status_history();

CREATE FUNCTION verify_rental_invoice_history_matches_current_status() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "RentalInvoice"
    WHERE "companyId" = NEW."companyId"
      AND "id" = NEW."invoiceId"
      AND "status" = NEW."toStatus"
  ) THEN
    RAISE EXCEPTION 'Rental invoice history must match the current invoice status';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "RentalInvoice_history_matches_status"
  AFTER INSERT ON "RentalInvoiceStatusHistory"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_rental_invoice_history_matches_current_status();
