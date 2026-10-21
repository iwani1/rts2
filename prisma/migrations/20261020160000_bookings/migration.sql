CREATE TABLE "Booking" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "contractId" TEXT,
  "routeId" TEXT,
  "reference" TEXT NOT NULL,
  "bookingType" TEXT NOT NULL,
  "journeyDate" DATE NOT NULL,
  "pickupLocationId" TEXT,
  "dropoffLocationId" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Booking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_client_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_employee_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_contract_fkey" FOREIGN KEY ("companyId", "contractId") REFERENCES "Contract"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_route_fkey" FOREIGN KEY ("companyId", "routeId") REFERENCES "Route"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_pickupLocation_fkey" FOREIGN KEY ("companyId", "pickupLocationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_dropoffLocation_fkey" FOREIGN KEY ("companyId", "dropoffLocationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_status_allowed" CHECK ("status" IN ('Pending', 'Accepted', 'Rejected', 'Assigned', 'Boarded', 'Completed', 'Cancelled')),
  CONSTRAINT "Booking_type_allowed" CHECK ("bookingType" IN ('HOME_TO_OFFICE', 'OFFICE_TO_HOME', 'ONE_TIME', 'RECURRING', 'AD_HOC', 'EMERGENCY', 'RETURN', 'ADDITIONAL_DESTINATION'))
);
CREATE UNIQUE INDEX "Booking_companyId_id_key" ON "Booking"("companyId", "id");
CREATE UNIQUE INDEX "Booking_companyId_reference_key" ON "Booking"("companyId", "reference");
CREATE INDEX "Booking_companyId_status_journeyDate_idx" ON "Booking"("companyId", "status", "journeyDate");
CREATE INDEX "Booking_companyId_employeeId_journeyDate_idx" ON "Booking"("companyId", "employeeId", "journeyDate");
CREATE INDEX "Booking_companyId_clientId_journeyDate_idx" ON "Booking"("companyId", "clientId", "journeyDate");

-- Duplicate prevention: one live booking per employee journey. Cancelled,
-- Rejected and Completed bookings do not block a new booking for the journey.
CREATE UNIQUE INDEX "Booking_active_journey_unique"
  ON "Booking"("companyId", "employeeId", "journeyDate", "bookingType", COALESCE("routeId", ''))
  WHERE "status" IN ('Pending', 'Accepted', 'Assigned', 'Boarded');

CREATE TABLE "BookingStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingStatusHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BookingStatusHistory_booking_fkey" FOREIGN KEY ("companyId", "bookingId") REFERENCES "Booking"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BookingStatusHistory_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BookingStatusHistory_to_nonempty" CHECK (length(trim("toStatus")) > 0),
  CONSTRAINT "BookingStatusHistory_reason_nonempty" CHECK (length(trim("reason")) > 0),
  CONSTRAINT "BookingStatusHistory_allowed_transition" CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'Pending')
    OR ("fromStatus" = 'Pending' AND "toStatus" IN ('Accepted', 'Rejected', 'Cancelled'))
    OR ("fromStatus" = 'Accepted' AND "toStatus" IN ('Assigned', 'Cancelled'))
    OR ("fromStatus" = 'Assigned' AND "toStatus" IN ('Boarded', 'Cancelled', 'Accepted'))
    OR ("fromStatus" = 'Boarded' AND "toStatus" = 'Completed')
  )
);
CREATE UNIQUE INDEX "BookingStatusHistory_companyId_bookingId_sequence_key" ON "BookingStatusHistory"("companyId", "bookingId", "sequence");
CREATE INDEX "BookingStatusHistory_companyId_bookingId_createdAt_idx" ON "BookingStatusHistory"("companyId", "bookingId", "createdAt");

CREATE FUNCTION prevent_booking_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BookingStatusHistory rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "BookingStatusHistory_immutable"
  BEFORE UPDATE OR DELETE ON "BookingStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_booking_history_mutation();

CREATE FUNCTION enforce_booking_status_transition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'Pending' THEN
      RAISE EXCEPTION 'Bookings must be created as Pending';
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'Pending' AND NEW."status" IN ('Accepted', 'Rejected', 'Cancelled'))
      OR (OLD."status" = 'Accepted' AND NEW."status" IN ('Assigned', 'Cancelled'))
      OR (OLD."status" = 'Assigned' AND NEW."status" IN ('Boarded', 'Cancelled', 'Accepted'))
      OR (OLD."status" = 'Boarded' AND NEW."status" = 'Completed')
    ) THEN
      RAISE EXCEPTION 'Booking status transition is not approved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Booking_status_transition_guard"
  BEFORE INSERT OR UPDATE OF "status" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION enforce_booking_status_transition();

CREATE FUNCTION verify_booking_status_history() RETURNS trigger AS $$
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
    SELECT 1 FROM "BookingStatusHistory"
    WHERE "companyId" = NEW."companyId"
      AND "bookingId" = NEW."id"
      AND "fromStatus" IS NOT DISTINCT FROM expected_from
      AND "toStatus" = expected_to
  ) THEN
    RAISE EXCEPTION 'Every booking status change requires status history';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "Booking_status_history_required"
  AFTER INSERT OR UPDATE ON "Booking"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_booking_status_history();

CREATE FUNCTION verify_booking_history_matches_current_status() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Booking"
    WHERE "companyId" = NEW."companyId"
      AND "id" = NEW."bookingId"
      AND "status" = NEW."toStatus"
  ) THEN
    RAISE EXCEPTION 'Booking history must match the current booking status';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "Booking_history_matches_status"
  AFTER INSERT ON "BookingStatusHistory"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_booking_history_matches_current_status();
