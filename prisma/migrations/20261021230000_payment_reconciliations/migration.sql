-- FIN-08 (D-085): stored payment-reconciliation runs, OPEN -> CLOSED, with
-- sequenced append-only history guarded exactly like FIN-05 expenses.

CREATE TABLE "PaymentReconciliation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "summary" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentReconciliation_status_check" CHECK ("status" IN ('OPEN', 'CLOSED')),
  CONSTRAINT "PaymentReconciliation_reference_format" CHECK ("reference" ~ '^REC-[A-F0-9]{16}$'),
  CONSTRAINT "PaymentReconciliation_period_order" CHECK ("periodEnd" >= "periodStart")
);

CREATE UNIQUE INDEX "PaymentReconciliation_companyId_id_key" ON "PaymentReconciliation"("companyId", "id");
CREATE UNIQUE INDEX "PaymentReconciliation_companyId_reference_key" ON "PaymentReconciliation"("companyId", "reference");
CREATE INDEX "PaymentReconciliation_companyId_status_createdAt_idx" ON "PaymentReconciliation"("companyId", "status", "createdAt");

ALTER TABLE "PaymentReconciliation"
  ADD CONSTRAINT "PaymentReconciliation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReconciliation"
  ADD CONSTRAINT "PaymentReconciliation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentReconciliationStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentReconciliationStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentReconciliationHistory_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "PaymentReconciliationHistory_status_check" CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'OPEN' AND "sequence" = 1)
    OR ("fromStatus" = 'OPEN' AND "toStatus" = 'CLOSED')
  )
);

CREATE UNIQUE INDEX "PaymentReconciliationStatusHistory_companyId_recon_sequence_key"
  ON "PaymentReconciliationStatusHistory"("companyId", "reconciliationId", "sequence");
CREATE INDEX "PaymentReconciliationStatusHistory_companyId_recon_createdAt_idx"
  ON "PaymentReconciliationStatusHistory"("companyId", "reconciliationId", "createdAt");

ALTER TABLE "PaymentReconciliationStatusHistory"
  ADD CONSTRAINT "PaymentReconciliationStatusHistory_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReconciliationStatusHistory"
  ADD CONSTRAINT "PaymentReconciliationStatusHistory_company_recon_fkey"
  FOREIGN KEY ("companyId", "reconciliationId") REFERENCES "PaymentReconciliation"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReconciliationStatusHistory"
  ADD CONSTRAINT "PaymentReconciliationStatusHistory_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION validate_reconciliation_history_append() RETURNS trigger AS $$
DECLARE
  previous_sequence INTEGER;
  previous_status TEXT;
BEGIN
  SELECT "sequence", "toStatus" INTO previous_sequence, previous_status
  FROM "PaymentReconciliationStatusHistory"
  WHERE "companyId" = NEW."companyId" AND "reconciliationId" = NEW."reconciliationId"
  ORDER BY "sequence" DESC LIMIT 1;
  IF previous_sequence IS NULL THEN
    IF NEW."sequence" <> 1 OR NEW."fromStatus" IS NOT NULL OR NEW."toStatus" <> 'OPEN' THEN
      RAISE EXCEPTION 'Reconciliation history must start at sequence 1 with OPEN';
    END IF;
  ELSIF NEW."sequence" <> previous_sequence + 1 OR NEW."fromStatus" IS DISTINCT FROM previous_status THEN
    RAISE EXCEPTION 'Reconciliation history sequence or from-status does not follow the prior event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentReconciliationStatusHistory_validate_append"
  BEFORE INSERT ON "PaymentReconciliationStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION validate_reconciliation_history_append();

CREATE FUNCTION prevent_reconciliation_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Reconciliation status history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentReconciliationStatusHistory_prevent_mutation"
  BEFORE UPDATE OR DELETE ON "PaymentReconciliationStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_history_mutation();

CREATE FUNCTION require_reconciliation_status_history() RETURNS trigger AS $$
DECLARE latest_status TEXT;
BEGIN
  SELECT "toStatus" INTO latest_status
  FROM "PaymentReconciliationStatusHistory"
  WHERE "companyId" = NEW."companyId" AND "reconciliationId" = NEW."id"
  ORDER BY "sequence" DESC LIMIT 1;
  IF latest_status IS NULL OR latest_status <> NEW."status" THEN
    RAISE EXCEPTION 'Reconciliation status must match its latest history event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "PaymentReconciliation_status_history_guard"
  AFTER INSERT OR UPDATE OF "status" ON "PaymentReconciliation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_reconciliation_status_history();

INSERT INTO "RolePermission" ("roleCode", "permission", "scope") VALUES
  ('SUPER_ADMIN', 'payment:reconcile', 'GLOBAL'),
  ('FINANCE_OFFICER', 'payment:reconcile', 'COMPANY'),
  ('OPS_MANAGER', 'payment:reconcile', 'READ_ONLY')
ON CONFLICT DO NOTHING;
