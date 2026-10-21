CREATE TABLE "Contract" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "serviceType" TEXT,
  "startDate" DATE,
  "endDate" DATE,
  "renewalDate" DATE,
  "routesAndStops" TEXT,
  "serviceDaysAndShifts" TEXT,
  "vehicleRequirements" TEXT,
  "pricingModel" TEXT,
  "billingFrequency" TEXT,
  "paymentTerms" TEXT,
  "serviceLevelTargets" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Contract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Contract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Contract_client_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Contract_status_allowed" CHECK ("status" IN ('Draft', 'Pending Approval', 'Active', 'Suspended', 'Expired', 'Terminated')),
  CONSTRAINT "Contract_dates_ordered" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate")
);
CREATE UNIQUE INDEX "Contract_companyId_id_key" ON "Contract"("companyId", "id");
CREATE UNIQUE INDEX "Contract_companyId_reference_key" ON "Contract"("companyId", "reference");
CREATE INDEX "Contract_companyId_status_createdAt_idx" ON "Contract"("companyId", "status", "createdAt");
CREATE INDEX "Contract_companyId_clientId_createdAt_idx" ON "Contract"("companyId", "clientId", "createdAt");
CREATE INDEX "Contract_companyId_endDate_idx" ON "Contract"("companyId", "endDate");

CREATE TABLE "ContractStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContractStatusHistory_contract_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "Contract"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractStatusHistory_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractStatusHistory_to_nonempty" CHECK (length(trim("toStatus")) > 0),
  CONSTRAINT "ContractStatusHistory_reason_nonempty" CHECK (length(trim("reason")) > 0),
  CONSTRAINT "ContractStatusHistory_allowed_transition" CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'Draft')
    OR ("fromStatus" = 'Draft' AND "toStatus" = 'Pending Approval')
    OR ("fromStatus" = 'Pending Approval' AND "toStatus" = 'Active')
    OR ("fromStatus" = 'Pending Approval' AND "toStatus" = 'Draft')
    OR ("fromStatus" = 'Active' AND "toStatus" = 'Suspended')
    OR ("fromStatus" = 'Active' AND "toStatus" = 'Expired')
    OR ("fromStatus" = 'Active' AND "toStatus" = 'Terminated')
    OR ("fromStatus" = 'Suspended' AND "toStatus" = 'Active')
    OR ("fromStatus" = 'Suspended' AND "toStatus" = 'Expired')
    OR ("fromStatus" = 'Suspended' AND "toStatus" = 'Terminated')
    OR ("fromStatus" = 'Expired' AND "toStatus" = 'Active')
  )
);
CREATE UNIQUE INDEX "ContractStatusHistory_companyId_contractId_sequence_key" ON "ContractStatusHistory"("companyId", "contractId", "sequence");
CREATE INDEX "ContractStatusHistory_companyId_contractId_createdAt_idx" ON "ContractStatusHistory"("companyId", "contractId", "createdAt");

CREATE FUNCTION prevent_contract_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ContractStatusHistory rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ContractStatusHistory_immutable"
  BEFORE UPDATE OR DELETE ON "ContractStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_contract_history_mutation();

CREATE FUNCTION enforce_contract_status_transition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'Draft' THEN
      RAISE EXCEPTION 'Contracts must be created as Draft';
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'Draft' AND NEW."status" = 'Pending Approval')
      OR (OLD."status" = 'Pending Approval' AND NEW."status" = 'Active')
      OR (OLD."status" = 'Pending Approval' AND NEW."status" = 'Draft')
      OR (OLD."status" = 'Active' AND NEW."status" = 'Suspended')
      OR (OLD."status" = 'Active' AND NEW."status" = 'Expired')
      OR (OLD."status" = 'Active' AND NEW."status" = 'Terminated')
      OR (OLD."status" = 'Suspended' AND NEW."status" = 'Active')
      OR (OLD."status" = 'Suspended' AND NEW."status" = 'Expired')
      OR (OLD."status" = 'Suspended' AND NEW."status" = 'Terminated')
      OR (OLD."status" = 'Expired' AND NEW."status" = 'Active')
    ) THEN
      RAISE EXCEPTION 'Contract status transition is not approved';
    END IF;
    IF OLD."status" = 'Pending Approval' AND NEW."status" = 'Active' AND (
      NEW."startDate" IS NULL OR NEW."endDate" IS NULL OR NEW."endDate" < NEW."startDate"
    ) THEN
      RAISE EXCEPTION 'Contract activation requires a start date and an end date on or after it';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Contract_status_transition_guard"
  BEFORE INSERT OR UPDATE OF "status" ON "Contract"
  FOR EACH ROW EXECUTE FUNCTION enforce_contract_status_transition();

CREATE FUNCTION verify_contract_status_history() RETURNS trigger AS $$
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
    SELECT 1 FROM "ContractStatusHistory"
    WHERE "companyId" = NEW."companyId"
      AND "contractId" = NEW."id"
      AND "fromStatus" IS NOT DISTINCT FROM expected_from
      AND "toStatus" = expected_to
  ) THEN
    RAISE EXCEPTION 'Every contract status change requires status history';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "Contract_status_history_required"
  AFTER INSERT OR UPDATE ON "Contract"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_contract_status_history();

CREATE FUNCTION verify_contract_history_matches_current_status() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Contract"
    WHERE "companyId" = NEW."companyId"
      AND "id" = NEW."contractId"
      AND "status" = NEW."toStatus"
  ) THEN
    RAISE EXCEPTION 'Contract history must match the current contract status';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "Contract_history_matches_status"
  AFTER INSERT ON "ContractStatusHistory"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_contract_history_matches_current_status();
