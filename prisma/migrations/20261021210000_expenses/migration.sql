-- FIN-05 (D-081): expense records with independent approval.
-- Lifecycle Pending -> Approved | Rejected, both terminal, decided by
-- someone other than the recorder (service-enforced), with sequenced
-- append-only history guarded exactly like work orders.

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "expenseDate" DATE NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "supplier" TEXT,
  "method" TEXT,
  "receiptReference" TEXT,
  "amountPesewas" INTEGER NOT NULL,
  "vehicleId" TEXT,
  "tripId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Pending',
  "recordedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Expense_category_check" CHECK ("category" IN ('FUEL', 'MAINTENANCE', 'REPAIRS', 'TYRES', 'TOLLS', 'OTHER')),
  CONSTRAINT "Expense_amount_positive" CHECK ("amountPesewas" > 0),
  CONSTRAINT "Expense_status_check" CHECK ("status" IN ('Pending', 'Approved', 'Rejected')),
  CONSTRAINT "Expense_reference_format" CHECK ("reference" ~ '^EXP-[A-F0-9]{16}$')
);

CREATE UNIQUE INDEX "Expense_companyId_id_key" ON "Expense"("companyId", "id");

CREATE TABLE "ExpenseStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpenseStatusHistory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_companyId_vehicleId_fkey" FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_companyId_tripId_fkey" FOREIGN KEY ("companyId", "tripId") REFERENCES "Trip"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseStatusHistory"
  ADD CONSTRAINT "ExpenseStatusHistory_companyId_expenseId_fkey" FOREIGN KEY ("companyId", "expenseId") REFERENCES "Expense"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseStatusHistory"
  ADD CONSTRAINT "ExpenseStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Expense_companyId_reference_key" ON "Expense"("companyId", "reference");
CREATE INDEX "Expense_companyId_status_expenseDate_idx" ON "Expense"("companyId", "status", "expenseDate");
CREATE INDEX "Expense_companyId_vehicleId_expenseDate_idx" ON "Expense"("companyId", "vehicleId", "expenseDate");
CREATE INDEX "Expense_companyId_tripId_idx" ON "Expense"("companyId", "tripId");
CREATE UNIQUE INDEX "ExpenseStatusHistory_companyId_expenseId_sequence_key" ON "ExpenseStatusHistory"("companyId", "expenseId", "sequence");
CREATE INDEX "ExpenseStatusHistory_companyId_expenseId_createdAt_idx" ON "ExpenseStatusHistory"("companyId", "expenseId", "createdAt");

CREATE FUNCTION validate_expense_history_append() RETURNS trigger AS $$
DECLARE
  previous_sequence INTEGER;
  previous_status TEXT;
BEGIN
  SELECT "sequence", "toStatus" INTO previous_sequence, previous_status
  FROM "ExpenseStatusHistory"
  WHERE "companyId" = NEW."companyId" AND "expenseId" = NEW."expenseId"
  ORDER BY "sequence" DESC LIMIT 1;
  IF previous_sequence IS NULL THEN
    IF NEW."sequence" <> 1 OR NEW."fromStatus" IS NOT NULL OR NEW."toStatus" <> 'Pending' THEN
      RAISE EXCEPTION 'First expense history event must initialize Pending at sequence 1';
    END IF;
  ELSIF NEW."sequence" <> previous_sequence + 1 OR NEW."fromStatus" IS DISTINCT FROM previous_status THEN
    RAISE EXCEPTION 'Expense history sequence or from-status does not follow the prior event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ExpenseStatusHistory_append_guard"
  BEFORE INSERT ON "ExpenseStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION validate_expense_history_append();

CREATE FUNCTION prevent_expense_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Expense status history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ExpenseStatusHistory_immutable"
  BEFORE UPDATE OR DELETE ON "ExpenseStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_expense_history_mutation();

CREATE FUNCTION require_expense_status_history() RETURNS trigger AS $$
DECLARE latest_status TEXT;
BEGIN
  SELECT "toStatus" INTO latest_status
  FROM "ExpenseStatusHistory"
  WHERE "companyId" = NEW."companyId" AND "expenseId" = NEW."id"
  ORDER BY "sequence" DESC
  LIMIT 1;
  IF latest_status IS NULL OR latest_status <> NEW."status" THEN
    RAISE EXCEPTION 'Expense status must match its latest history event';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "Expense_status_history_guard"
  AFTER INSERT OR UPDATE OF "status" ON "Expense"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_expense_status_history();

-- FIN-05 access (D-081): finance writes and decides; ops may read.
INSERT INTO "RolePermission" ("roleCode", "permission", "scope") VALUES
  ('SUPER_ADMIN', 'expense:manage', 'GLOBAL'),
  ('FINANCE_OFFICER', 'expense:manage', 'COMPANY'),
  ('OPS_MANAGER', 'expense:manage', 'READ_ONLY')
ON CONFLICT DO NOTHING;
