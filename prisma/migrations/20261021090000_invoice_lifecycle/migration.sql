-- Phase 1C (D-061/D-062): governed invoice lifecycle DRAFT -> ISSUED -> PAID,
-- VOID from DRAFT/ISSUED; append-only payments; outstanding = total - payments.
--
-- Enforcement notes:
-- * PostgreSQL index predicates cannot contain subqueries, so the
--   status-aware trip-billing freeze is materialised as
--   CorporateInvoiceLine.billingActive (maintained only by the triggers
--   below) with a partial unique index on that plain column.
-- * The contract+period uniqueness becomes status-aware the same way:
--   it constrains non-VOID invoices only, so voiding an invoice frees its
--   contract+period (and its trips) for a replacement invoice.

-- 1) Widen the status set.
ALTER TABLE "CorporateInvoice" DROP CONSTRAINT "CorporateInvoice_status_allowed";
ALTER TABLE "CorporateInvoice"
  ADD CONSTRAINT "CorporateInvoice_status_allowed"
  CHECK ("status" IN ('DRAFT', 'ISSUED', 'PAID', 'VOID'));

-- 2) Lifecycle tables.
CREATE TABLE "CorporateInvoiceStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CorporateInvoiceStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CorporateInvoiceStatusHistory_invoice_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "CorporateInvoice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CorporateInvoiceStatusHistory_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CorporateInvoiceStatusHistory_to_status_allowed" CHECK ("toStatus" IN ('DRAFT', 'ISSUED', 'PAID', 'VOID')),
  CONSTRAINT "CorporateInvoiceStatusHistory_transition_allowed" CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'DRAFT')
    OR ("fromStatus" = 'DRAFT' AND "toStatus" IN ('ISSUED', 'VOID'))
    OR ("fromStatus" = 'ISSUED' AND "toStatus" IN ('PAID', 'VOID'))
  )
);
CREATE UNIQUE INDEX "CorporateInvoiceStatusHistory_companyId_invoiceId_sequence_key"
  ON "CorporateInvoiceStatusHistory"("companyId", "invoiceId", "sequence");
CREATE INDEX "CorporateInvoiceStatusHistory_companyId_invoiceId_createdAt_idx"
  ON "CorporateInvoiceStatusHistory"("companyId", "invoiceId", "createdAt");

CREATE TABLE "InvoicePayment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amountPesewas" INTEGER NOT NULL,
  "method" TEXT,
  "reference" TEXT,
  "receivedAt" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoicePayment_invoice_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "CorporateInvoice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InvoicePayment_recordedBy_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InvoicePayment_amount_positive" CHECK ("amountPesewas" > 0)
);
CREATE INDEX "InvoicePayment_companyId_invoiceId_createdAt_idx"
  ON "InvoicePayment"("companyId", "invoiceId", "createdAt");

-- 3) Backfill sequence-1 DRAFT history for invoices generated in Phase 1B.
INSERT INTO "CorporateInvoiceStatusHistory" ("id", "companyId", "invoiceId", "sequence", "actorId", "fromStatus", "toStatus", "reason")
SELECT 'backfill-' || i."id", i."companyId", i."id", 1, g."actorId", NULL, 'DRAFT', 'Invoice generated'
FROM "CorporateInvoice" i
JOIN LATERAL (
  SELECT "actorId" FROM "AuditEvent"
  WHERE "entityType" = 'CORPORATE_INVOICE' AND "entityId" = i."id" AND "action" = 'CORPORATE_INVOICE_GENERATED'
  ORDER BY "createdAt" ASC LIMIT 1
) g ON TRUE;

-- 4) Payments and history are append-only.
CREATE FUNCTION prevent_invoice_payment_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'InvoicePayment rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InvoicePayment_immutable"
  BEFORE UPDATE OR DELETE ON "InvoicePayment"
  FOR EACH ROW EXECUTE FUNCTION prevent_invoice_payment_mutation();

CREATE FUNCTION prevent_invoice_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CorporateInvoiceStatusHistory rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CorporateInvoiceStatusHistory_immutable"
  BEFORE UPDATE OR DELETE ON "CorporateInvoiceStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_invoice_history_mutation();

-- 5) Replace full invoice immutability with a lifecycle guard: only the
--    status column may change, and only along approved transitions. An
--    invoice with recorded payments can never be voided (payments are
--    append-only, so there is no clawback path).
DROP TRIGGER "CorporateInvoice_immutable" ON "CorporateInvoice";
DROP FUNCTION prevent_corporate_invoice_mutation();
CREATE FUNCTION enforce_corporate_invoice_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CorporateInvoice rows cannot be deleted';
  END IF;
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
    OR NEW."contractId" IS DISTINCT FROM OLD."contractId"
    OR NEW."reference" IS DISTINCT FROM OLD."reference"
    OR NEW."periodStart" IS DISTINCT FROM OLD."periodStart"
    OR NEW."periodEnd" IS DISTINCT FROM OLD."periodEnd"
    OR NEW."subtotalPesewas" IS DISTINCT FROM OLD."subtotalPesewas"
    OR NEW."taxPesewas" IS DISTINCT FROM OLD."taxPesewas"
    OR NEW."totalPesewas" IS DISTINCT FROM OLD."totalPesewas"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'CorporateInvoice financial and identity fields are immutable';
  END IF;
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'DRAFT' AND NEW."status" IN ('ISSUED', 'VOID'))
      OR (OLD."status" = 'ISSUED' AND NEW."status" IN ('PAID', 'VOID'))
    ) THEN
      RAISE EXCEPTION 'CorporateInvoice status transition is not approved';
    END IF;
    IF NEW."status" = 'VOID' AND EXISTS (
      SELECT 1 FROM "InvoicePayment"
      WHERE "companyId" = NEW."companyId" AND "invoiceId" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'An invoice with recorded payments cannot be voided';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CorporateInvoice_change_guard"
  BEFORE UPDATE OR DELETE ON "CorporateInvoice"
  FOR EACH ROW EXECUTE FUNCTION enforce_corporate_invoice_change();

CREATE FUNCTION enforce_corporate_invoice_creation() RETURNS trigger AS $$
BEGIN
  IF NEW."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'CorporateInvoices must be created as DRAFT';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CorporateInvoice_creation_guard"
  BEFORE INSERT ON "CorporateInvoice"
  FOR EACH ROW EXECUTE FUNCTION enforce_corporate_invoice_creation();

-- 6) Every status change requires a matching history row (deferred to txn end).
CREATE FUNCTION verify_invoice_status_history() RETURNS trigger AS $$
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
    SELECT 1 FROM "CorporateInvoiceStatusHistory"
    WHERE "companyId" = NEW."companyId"
      AND "invoiceId" = NEW."id"
      AND "fromStatus" IS NOT DISTINCT FROM expected_from
      AND "toStatus" = expected_to
  ) THEN
    RAISE EXCEPTION 'Every invoice status change requires status history';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "CorporateInvoice_status_history_required"
  AFTER INSERT OR UPDATE ON "CorporateInvoice"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_invoice_status_history();

CREATE FUNCTION verify_invoice_history_matches_current_status() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "CorporateInvoice"
    WHERE "companyId" = NEW."companyId"
      AND "id" = NEW."invoiceId"
      AND "status" = NEW."toStatus"
  ) THEN
    RAISE EXCEPTION 'Invoice history must match the current invoice status';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "CorporateInvoice_history_matches_status"
  AFTER INSERT ON "CorporateInvoiceStatusHistory"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_invoice_history_matches_current_status();

-- 7) Contract+period uniqueness applies to non-VOID invoices only.
DROP INDEX "CorporateInvoice_companyId_contractId_periodStart_periodEnd_key";
CREATE UNIQUE INDEX "CorporateInvoice_companyId_contractId_periodStart_periodEnd_key"
  ON "CorporateInvoice"("companyId", "contractId", "periodStart", "periodEnd")
  WHERE "status" <> 'VOID';

-- 8) Trip-billing freeze, status-aware. billingActive is true while the
--    parent invoice is not VOID; it is maintained only by these triggers.
ALTER TABLE "CorporateInvoiceLine"
  ADD COLUMN "billingActive" BOOLEAN NOT NULL DEFAULT TRUE;

CREATE FUNCTION set_invoice_line_billing_active() RETURNS trigger AS $$
DECLARE
  parent_status TEXT;
BEGIN
  SELECT "status" INTO parent_status FROM "CorporateInvoice"
  WHERE "companyId" = NEW."companyId" AND "id" = NEW."invoiceId";
  IF FOUND THEN
    NEW."billingActive" := parent_status <> 'VOID';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CorporateInvoiceLine_billing_active_on_insert"
  BEFORE INSERT ON "CorporateInvoiceLine"
  FOR EACH ROW EXECUTE FUNCTION set_invoice_line_billing_active();

CREATE FUNCTION release_invoice_lines_on_void() RETURNS trigger AS $$
BEGIN
  UPDATE "CorporateInvoiceLine"
  SET "billingActive" = FALSE
  WHERE "companyId" = NEW."companyId" AND "invoiceId" = NEW."id" AND "billingActive";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CorporateInvoice_release_lines_on_void"
  AFTER UPDATE OF "status" ON "CorporateInvoice"
  FOR EACH ROW
  WHEN (OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'VOID')
  EXECUTE FUNCTION release_invoice_lines_on_void();

-- Lines stay immutable except for the trigger-maintained billing release.
DROP TRIGGER "CorporateInvoiceLine_immutable" ON "CorporateInvoiceLine";
DROP FUNCTION prevent_corporate_invoice_line_mutation();
CREATE FUNCTION enforce_corporate_invoice_line_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CorporateInvoiceLine rows cannot be deleted';
  END IF;
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId"
    OR NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId"
    OR NEW."tripId" IS DISTINCT FROM OLD."tripId"
    OR NEW."description" IS DISTINCT FROM OLD."description"
    OR NEW."unit" IS DISTINCT FROM OLD."unit"
    OR NEW."quantity" IS DISTINCT FROM OLD."quantity"
    OR NEW."ratePesewas" IS DISTINCT FROM OLD."ratePesewas"
    OR NEW."amountPesewas" IS DISTINCT FROM OLD."amountPesewas"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'CorporateInvoiceLine fields are immutable';
  END IF;
  IF NEW."billingActive" IS DISTINCT FROM OLD."billingActive" THEN
    IF NOT (
      OLD."billingActive" AND NOT NEW."billingActive"
      AND EXISTS (
        SELECT 1 FROM "CorporateInvoice"
        WHERE "companyId" = NEW."companyId" AND "id" = NEW."invoiceId" AND "status" = 'VOID'
      )
    ) THEN
      RAISE EXCEPTION 'CorporateInvoiceLine billingActive may only be released when its invoice is VOID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CorporateInvoiceLine_change_guard"
  BEFORE UPDATE OR DELETE ON "CorporateInvoiceLine"
  FOR EACH ROW EXECUTE FUNCTION enforce_corporate_invoice_line_change();

DROP INDEX "CorporateInvoiceLine_trip_unique";
CREATE UNIQUE INDEX "CorporateInvoiceLine_trip_unique"
  ON "CorporateInvoiceLine"("companyId", "tripId")
  WHERE "tripId" IS NOT NULL AND "billingActive";

-- 9) Payments may only land on ISSUED invoices (the service enforces the
--    balance under the invoice row lock; this trigger enforces the state and
--    takes a share lock so a concurrent status change cannot interleave).
CREATE FUNCTION enforce_payment_invoice_state() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM "CorporateInvoice"
  WHERE "companyId" = NEW."companyId" AND "id" = NEW."invoiceId" AND "status" = 'ISSUED'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payments may only be recorded against ISSUED invoices';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "InvoicePayment_invoice_state"
  BEFORE INSERT ON "InvoicePayment"
  FOR EACH ROW EXECUTE FUNCTION enforce_payment_invoice_state();
