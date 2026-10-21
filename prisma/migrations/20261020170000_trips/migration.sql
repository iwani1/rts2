CREATE TABLE "Trip" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT,
  "routeId" TEXT,
  "scheduleId" TEXT,
  "reference" TEXT NOT NULL,
  "serviceType" TEXT,
  "tripDate" DATE NOT NULL,
  "plannedStartTime" TEXT,
  "plannedDurationMinutes" INTEGER,
  "capacityLimit" INTEGER,
  "vehicleId" TEXT,
  "driverId" TEXT,
  "status" TEXT NOT NULL,
  "delayReason" TEXT,
  "completionNotes" TEXT,
  "actualStartAt" TIMESTAMPTZ(6),
  "actualEndAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Trip_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Trip_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_client_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_route_fkey" FOREIGN KEY ("companyId", "routeId") REFERENCES "Route"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_schedule_fkey" FOREIGN KEY ("companyId", "scheduleId") REFERENCES "RouteSchedule"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_vehicle_fkey" FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_driver_fkey" FOREIGN KEY ("companyId", "driverId") REFERENCES "Driver"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_status_allowed" CHECK ("status" IN ('Planned', 'Ready for Dispatch', 'Dispatched', 'In Progress', 'Delayed', 'Completed', 'Cancelled', 'Interrupted')),
  CONSTRAINT "Trip_plannedStartTime_format" CHECK ("plannedStartTime" IS NULL OR "plannedStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "Trip_duration_positive" CHECK ("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" > 0),
  CONSTRAINT "Trip_capacity_positive" CHECK ("capacityLimit" IS NULL OR "capacityLimit" > 0)
);
CREATE UNIQUE INDEX "Trip_companyId_id_key" ON "Trip"("companyId", "id");
CREATE UNIQUE INDEX "Trip_companyId_reference_key" ON "Trip"("companyId", "reference");
CREATE INDEX "Trip_companyId_status_tripDate_idx" ON "Trip"("companyId", "status", "tripDate");
CREATE INDEX "Trip_companyId_routeId_tripDate_idx" ON "Trip"("companyId", "routeId", "tripDate");
CREATE INDEX "Trip_companyId_driverId_tripDate_idx" ON "Trip"("companyId", "driverId", "tripDate");

-- One materialized trip per schedule occurrence; manual trips have no schedule.
CREATE UNIQUE INDEX "Trip_schedule_occurrence_unique"
  ON "Trip"("companyId", "scheduleId", "tripDate")
  WHERE "scheduleId" IS NOT NULL;

ALTER TABLE "Booking" ADD COLUMN "tripId" TEXT;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_trip_fkey" FOREIGN KEY ("companyId", "tripId") REFERENCES "Trip"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Booking_companyId_tripId_idx" ON "Booking"("companyId", "tripId");

CREATE TABLE "TripStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TripStatusHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TripStatusHistory_trip_fkey" FOREIGN KEY ("companyId", "tripId") REFERENCES "Trip"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TripStatusHistory_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TripStatusHistory_to_nonempty" CHECK (length(trim("toStatus")) > 0),
  CONSTRAINT "TripStatusHistory_reason_nonempty" CHECK (length(trim("reason")) > 0),
  CONSTRAINT "TripStatusHistory_allowed_transition" CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'Planned')
    OR ("fromStatus" = 'Planned' AND "toStatus" IN ('Ready for Dispatch', 'Cancelled'))
    OR ("fromStatus" = 'Ready for Dispatch' AND "toStatus" IN ('Dispatched', 'Cancelled', 'Planned'))
    OR ("fromStatus" = 'Dispatched' AND "toStatus" IN ('In Progress', 'Delayed', 'Interrupted'))
    OR ("fromStatus" = 'In Progress' AND "toStatus" IN ('Delayed', 'Interrupted', 'Completed'))
    OR ("fromStatus" = 'Delayed' AND "toStatus" IN ('In Progress', 'Completed', 'Interrupted'))
    OR ("fromStatus" = 'Interrupted' AND "toStatus" IN ('In Progress', 'Completed', 'Cancelled'))
  )
);
CREATE UNIQUE INDEX "TripStatusHistory_companyId_tripId_sequence_key" ON "TripStatusHistory"("companyId", "tripId", "sequence");
CREATE INDEX "TripStatusHistory_companyId_tripId_createdAt_idx" ON "TripStatusHistory"("companyId", "tripId", "createdAt");

CREATE FUNCTION prevent_trip_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'TripStatusHistory rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "TripStatusHistory_immutable"
  BEFORE UPDATE OR DELETE ON "TripStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_trip_history_mutation();

CREATE FUNCTION enforce_trip_status_transition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'Planned' THEN
      RAISE EXCEPTION 'Trips must be created as Planned';
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'Planned' AND NEW."status" IN ('Ready for Dispatch', 'Cancelled'))
      OR (OLD."status" = 'Ready for Dispatch' AND NEW."status" IN ('Dispatched', 'Cancelled', 'Planned'))
      OR (OLD."status" = 'Dispatched' AND NEW."status" IN ('In Progress', 'Delayed', 'Interrupted'))
      OR (OLD."status" = 'In Progress' AND NEW."status" IN ('Delayed', 'Interrupted', 'Completed'))
      OR (OLD."status" = 'Delayed' AND NEW."status" IN ('In Progress', 'Completed', 'Interrupted'))
      OR (OLD."status" = 'Interrupted' AND NEW."status" IN ('In Progress', 'Completed', 'Cancelled'))
    ) THEN
      RAISE EXCEPTION 'Trip status transition is not approved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Trip_status_transition_guard"
  BEFORE INSERT OR UPDATE OF "status" ON "Trip"
  FOR EACH ROW EXECUTE FUNCTION enforce_trip_status_transition();

CREATE FUNCTION verify_trip_status_history() RETURNS trigger AS $$
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
    SELECT 1 FROM "TripStatusHistory"
    WHERE "companyId" = NEW."companyId"
      AND "tripId" = NEW."id"
      AND "fromStatus" IS NOT DISTINCT FROM expected_from
      AND "toStatus" = expected_to
  ) THEN
    RAISE EXCEPTION 'Every trip status change requires status history';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "Trip_status_history_required"
  AFTER INSERT OR UPDATE ON "Trip"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_trip_status_history();

CREATE FUNCTION verify_trip_history_matches_current_status() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Trip"
    WHERE "companyId" = NEW."companyId"
      AND "id" = NEW."tripId"
      AND "status" = NEW."toStatus"
  ) THEN
    RAISE EXCEPTION 'Trip history must match the current trip status';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "Trip_history_matches_status"
  AFTER INSERT ON "TripStatusHistory"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_trip_history_matches_current_status();
