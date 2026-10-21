-- FIN-06 (D-086): configurable, approved driver pay rules and payroll runs.
-- No pay figure exists without an ACTIVE rule; runs snapshot computed lines
-- from recorded trips, bookings and driver-event timestamps.

CREATE TABLE "DriverPayRule" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "basis" TEXT NOT NULL,
  "ratePesewas" INTEGER NOT NULL,
  "overtimeThresholdMinutesPerDay" INTEGER,
  "overtimeRatePesewasPerHour" INTEGER,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "DriverPayRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverPayRule_reference_format" CHECK ("reference" ~ '^PAYRULE-[A-F0-9]{16}$'),
  CONSTRAINT "DriverPayRule_basis_check" CHECK ("basis" IN ('PER_COMPLETED_TRIP', 'PER_BOARDING', 'FLAT_PER_DAY')),
  CONSTRAINT "DriverPayRule_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  CONSTRAINT "DriverPayRule_rate_positive" CHECK ("ratePesewas" > 0),
  CONSTRAINT "DriverPayRule_overtime_pair" CHECK (
    ("overtimeThresholdMinutesPerDay" IS NULL AND "overtimeRatePesewasPerHour" IS NULL)
    OR ("overtimeThresholdMinutesPerDay" > 0 AND "overtimeRatePesewasPerHour" > 0)
  ),
  CONSTRAINT "DriverPayRule_effectivity_order" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE UNIQUE INDEX "DriverPayRule_companyId_id_key" ON "DriverPayRule"("companyId", "id");
CREATE UNIQUE INDEX "DriverPayRule_companyId_reference_key" ON "DriverPayRule"("companyId", "reference");
CREATE INDEX "DriverPayRule_companyId_status_effectiveFrom_idx" ON "DriverPayRule"("companyId", "status", "effectiveFrom");

ALTER TABLE "DriverPayRule"
  ADD CONSTRAINT "DriverPayRule_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverPayRule"
  ADD CONSTRAINT "DriverPayRule_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DriverPayRuleStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DriverPayRuleStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverPayRuleHistory_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "DriverPayRuleHistory_status_check" CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'DRAFT' AND "sequence" = 1)
    OR ("fromStatus" = 'DRAFT' AND "toStatus" IN ('ACTIVE', 'RETIRED'))
    OR ("fromStatus" = 'ACTIVE' AND "toStatus" = 'RETIRED')
  )
);

CREATE UNIQUE INDEX "DriverPayRuleStatusHistory_companyId_ruleId_sequence_key"
  ON "DriverPayRuleStatusHistory"("companyId", "ruleId", "sequence");
CREATE INDEX "DriverPayRuleStatusHistory_companyId_ruleId_createdAt_idx"
  ON "DriverPayRuleStatusHistory"("companyId", "ruleId", "createdAt");

ALTER TABLE "DriverPayRuleStatusHistory"
  ADD CONSTRAINT "DriverPayRuleStatusHistory_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverPayRuleStatusHistory"
  ADD CONSTRAINT "DriverPayRuleStatusHistory_company_rule_fkey"
  FOREIGN KEY ("companyId", "ruleId") REFERENCES "DriverPayRule"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverPayRuleStatusHistory"
  ADD CONSTRAINT "DriverPayRuleStatusHistory_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION validate_pay_rule_history_append() RETURNS trigger AS $$
DECLARE
  previous_sequence INTEGER;
  previous_status TEXT;
BEGIN
  SELECT "sequence", "toStatus" INTO previous_sequence, previous_status
  FROM "DriverPayRuleStatusHistory"
  WHERE "companyId" = NEW."companyId" AND "ruleId" = NEW."ruleId"
  ORDER BY "sequence" DESC LIMIT 1;
  IF previous_sequence IS NULL THEN
    IF NEW."sequence" <> 1 OR NEW."fromStatus" IS NOT NULL OR NEW."toStatus" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Pay rule history must start at sequence 1 with DRAFT';
    END IF;
  ELSIF NEW."sequence" <> previous_sequence + 1 OR NEW."fromStatus" IS DISTINCT FROM previous_status THEN
    RAISE EXCEPTION 'Pay rule history sequence or from-status does not follow the prior event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DriverPayRuleStatusHistory_validate_append"
  BEFORE INSERT ON "DriverPayRuleStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION validate_pay_rule_history_append();

CREATE FUNCTION prevent_pay_rule_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Pay rule status history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DriverPayRuleStatusHistory_prevent_mutation"
  BEFORE UPDATE OR DELETE ON "DriverPayRuleStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_pay_rule_history_mutation();

CREATE FUNCTION require_pay_rule_status_history() RETURNS trigger AS $$
DECLARE latest_status TEXT;
BEGIN
  SELECT "toStatus" INTO latest_status
  FROM "DriverPayRuleStatusHistory"
  WHERE "companyId" = NEW."companyId" AND "ruleId" = NEW."id"
  ORDER BY "sequence" DESC LIMIT 1;
  IF latest_status IS NULL OR latest_status <> NEW."status" THEN
    RAISE EXCEPTION 'Pay rule status must match its latest history event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "DriverPayRule_status_history_guard"
  AFTER INSERT OR UPDATE OF "status" ON "DriverPayRule"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_pay_rule_status_history();

CREATE TABLE "DriverPayrollRun" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "lines" JSONB NOT NULL,
  "totals" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "DriverPayrollRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverPayrollRun_reference_format" CHECK ("reference" ~ '^PAYRUN-[A-F0-9]{16}$'),
  CONSTRAINT "DriverPayrollRun_status_check" CHECK ("status" IN ('OPEN', 'FINAL')),
  CONSTRAINT "DriverPayrollRun_period_order" CHECK ("periodEnd" >= "periodStart")
);

CREATE UNIQUE INDEX "DriverPayrollRun_companyId_id_key" ON "DriverPayrollRun"("companyId", "id");
CREATE UNIQUE INDEX "DriverPayrollRun_companyId_reference_key" ON "DriverPayrollRun"("companyId", "reference");
CREATE INDEX "DriverPayrollRun_companyId_status_createdAt_idx" ON "DriverPayrollRun"("companyId", "status", "createdAt");

ALTER TABLE "DriverPayrollRun"
  ADD CONSTRAINT "DriverPayrollRun_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverPayrollRun"
  ADD CONSTRAINT "DriverPayrollRun_company_rule_fkey"
  FOREIGN KEY ("companyId", "ruleId") REFERENCES "DriverPayRule"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverPayrollRun"
  ADD CONSTRAINT "DriverPayrollRun_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DriverPayrollRunStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DriverPayrollRunStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverPayrollRunHistory_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "DriverPayrollRunHistory_status_check" CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'OPEN' AND "sequence" = 1)
    OR ("fromStatus" = 'OPEN' AND "toStatus" = 'FINAL')
  )
);

CREATE UNIQUE INDEX "DriverPayrollRunStatusHistory_companyId_runId_sequence_key"
  ON "DriverPayrollRunStatusHistory"("companyId", "runId", "sequence");
CREATE INDEX "DriverPayrollRunStatusHistory_companyId_runId_createdAt_idx"
  ON "DriverPayrollRunStatusHistory"("companyId", "runId", "createdAt");

ALTER TABLE "DriverPayrollRunStatusHistory"
  ADD CONSTRAINT "DriverPayrollRunStatusHistory_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverPayrollRunStatusHistory"
  ADD CONSTRAINT "DriverPayrollRunStatusHistory_company_run_fkey"
  FOREIGN KEY ("companyId", "runId") REFERENCES "DriverPayrollRun"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DriverPayrollRunStatusHistory"
  ADD CONSTRAINT "DriverPayrollRunStatusHistory_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION validate_payroll_run_history_append() RETURNS trigger AS $$
DECLARE
  previous_sequence INTEGER;
  previous_status TEXT;
BEGIN
  SELECT "sequence", "toStatus" INTO previous_sequence, previous_status
  FROM "DriverPayrollRunStatusHistory"
  WHERE "companyId" = NEW."companyId" AND "runId" = NEW."runId"
  ORDER BY "sequence" DESC LIMIT 1;
  IF previous_sequence IS NULL THEN
    IF NEW."sequence" <> 1 OR NEW."fromStatus" IS NOT NULL OR NEW."toStatus" <> 'OPEN' THEN
      RAISE EXCEPTION 'Payroll run history must start at sequence 1 with OPEN';
    END IF;
  ELSIF NEW."sequence" <> previous_sequence + 1 OR NEW."fromStatus" IS DISTINCT FROM previous_status THEN
    RAISE EXCEPTION 'Payroll run history sequence or from-status does not follow the prior event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DriverPayrollRunStatusHistory_validate_append"
  BEFORE INSERT ON "DriverPayrollRunStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION validate_payroll_run_history_append();

CREATE FUNCTION prevent_payroll_run_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Payroll run status history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DriverPayrollRunStatusHistory_prevent_mutation"
  BEFORE UPDATE OR DELETE ON "DriverPayrollRunStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_payroll_run_history_mutation();

CREATE FUNCTION require_payroll_run_status_history() RETURNS trigger AS $$
DECLARE latest_status TEXT;
BEGIN
  SELECT "toStatus" INTO latest_status
  FROM "DriverPayrollRunStatusHistory"
  WHERE "companyId" = NEW."companyId" AND "runId" = NEW."id"
  ORDER BY "sequence" DESC LIMIT 1;
  IF latest_status IS NULL OR latest_status <> NEW."status" THEN
    RAISE EXCEPTION 'Payroll run status must match its latest history event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "DriverPayrollRun_status_history_guard"
  AFTER INSERT OR UPDATE OF "status" ON "DriverPayrollRun"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_payroll_run_status_history();

INSERT INTO "RolePermission" ("roleCode", "permission", "scope") VALUES
  ('SUPER_ADMIN', 'driver:pay', 'GLOBAL'),
  ('FINANCE_OFFICER', 'driver:pay', 'COMPANY'),
  ('OPS_MANAGER', 'driver:pay', 'READ_ONLY')
ON CONFLICT DO NOTHING;
