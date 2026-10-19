CREATE UNIQUE INDEX "Customer_companyId_id_key" ON "Customer"("companyId", "id");

CREATE TABLE "RentalRequest" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "serviceDate" DATE,
  "departureTime" TEXT,
  "returnTime" TEXT,
  "durationMinutes" INTEGER,
  "pickupLocation" TEXT,
  "destination" TEXT,
  "intermediateStops" TEXT,
  "passengerCount" INTEGER,
  "luggageSpecialNeeds" TEXT,
  "purpose" TEXT,
  "requestedVehicleType" TEXT,
  "driverRequirement" TEXT,
  "tripContactName" TEXT,
  "tripContactTelephone" TEXT,
  "tripContactEmail" TEXT,
  "notes" TEXT,
  "requestSource" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RentalRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalRequest_customer_company_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "Customer"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalRequest_status_allowed" CHECK ("status" IN ('Draft', 'Submitted')),
  CONSTRAINT "RentalRequest_departureTime_format" CHECK ("departureTime" IS NULL OR "departureTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "RentalRequest_returnTime_format" CHECK ("returnTime" IS NULL OR "returnTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "RentalRequest_duration_positive" CHECK ("durationMinutes" IS NULL OR "durationMinutes" > 0),
  CONSTRAINT "RentalRequest_passenger_count_positive" CHECK ("passengerCount" IS NULL OR "passengerCount" > 0),
  CONSTRAINT "RentalRequest_source_allowed" CHECK ("requestSource" IS NULL OR "requestSource" IN ('APP', 'PHONE', 'EMAIL', 'OTHER'))
);
CREATE UNIQUE INDEX "RentalRequest_companyId_id_key" ON "RentalRequest"("companyId", "id");
CREATE INDEX "RentalRequest_companyId_status_createdAt_idx" ON "RentalRequest"("companyId", "status", "createdAt");
CREATE INDEX "RentalRequest_companyId_customerId_createdAt_idx" ON "RentalRequest"("companyId", "customerId", "createdAt");
CREATE INDEX "RentalRequest_companyId_serviceDate_idx" ON "RentalRequest"("companyId", "serviceDate");

CREATE TABLE "RentalRequestStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalRequestStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalRequestStatusHistory_request_fkey" FOREIGN KEY ("companyId", "requestId") REFERENCES "RentalRequest"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalRequestStatusHistory_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalRequestStatusHistory_to_nonempty" CHECK (length(trim("toStatus")) > 0),
  CONSTRAINT "RentalRequestStatusHistory_reason_nonempty" CHECK (length(trim("reason")) > 0),
  CONSTRAINT "RentalRequestStatusHistory_allowed_transition" CHECK (("fromStatus" IS NULL AND "toStatus" = 'Draft') OR ("fromStatus" = 'Draft' AND "toStatus" = 'Submitted'))
);
CREATE INDEX "RentalRequestStatusHistory_companyId_requestId_createdAt_idx" ON "RentalRequestStatusHistory"("companyId", "requestId", "createdAt");

CREATE FUNCTION prevent_rental_request_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RentalRequestStatusHistory rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalRequestStatusHistory_immutable"
  BEFORE UPDATE OR DELETE ON "RentalRequestStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_rental_request_history_mutation();


CREATE FUNCTION enforce_rental_request_status_transition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'Draft' THEN
      RAISE EXCEPTION 'Rental requests must be created as Draft';
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (OLD."status" = 'Draft' AND NEW."status" = 'Submitted') THEN
      RAISE EXCEPTION 'Rental request status transition is not approved';
    END IF;
    IF NEW."serviceDate" IS NULL OR NEW."departureTime" IS NULL
      OR NEW."pickupLocation" IS NULL OR length(trim(NEW."pickupLocation")) = 0
      OR NEW."destination" IS NULL OR length(trim(NEW."destination")) = 0
      OR NEW."passengerCount" IS NULL OR NEW."requestSource" IS NULL
      OR (NEW."returnTime" IS NULL AND NEW."durationMinutes" IS NULL) THEN
      RAISE EXCEPTION 'Rental request is missing required submission fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalRequest_status_transition_guard"
  BEFORE INSERT OR UPDATE OF "status" ON "RentalRequest"
  FOR EACH ROW EXECUTE FUNCTION enforce_rental_request_status_transition();

CREATE FUNCTION verify_rental_request_status_history() RETURNS trigger AS $$
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
    SELECT 1 FROM "RentalRequestStatusHistory"
    WHERE "companyId" = NEW."companyId"
      AND "requestId" = NEW."id"
      AND "fromStatus" IS NOT DISTINCT FROM expected_from
      AND "toStatus" = expected_to
  ) THEN
    RAISE EXCEPTION 'Every rental request status change requires status history';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "RentalRequest_status_history_required"
  AFTER INSERT OR UPDATE ON "RentalRequest"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_rental_request_status_history();

CREATE FUNCTION verify_rental_request_history_matches_current_status() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "RentalRequest"
    WHERE "companyId" = NEW."companyId"
      AND "id" = NEW."requestId"
      AND "status" = NEW."toStatus"
  ) THEN
    RAISE EXCEPTION 'Rental request history must match the current request status';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "RentalRequest_history_matches_status"
  AFTER INSERT ON "RentalRequestStatusHistory"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_rental_request_history_matches_current_status();
