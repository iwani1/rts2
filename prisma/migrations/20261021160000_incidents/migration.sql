-- INC-01 (D-071): governed incident records. DB-only slice; the Phase 2
-- replacement workflow (INC-02) builds on these tables.

CREATE TABLE "Incident" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "incidentType" VARCHAR(32) NOT NULL,
  "severity" VARCHAR(16) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Open',
  "tripId" TEXT,
  "vehicleId" TEXT,
  "driverId" TEXT,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL,
  "locationText" VARCHAR(300),
  "description" VARCHAR(2000) NOT NULL,
  "peopleAffected" VARCHAR(1000),
  "immediateAction" VARCHAR(1000),
  "reportedById" TEXT NOT NULL,
  "assignedResponderId" TEXT,
  "resolutionNotes" VARCHAR(2000),
  "resolvedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "Incident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Incident_incidentType_allowed" CHECK (
    "incidentType" IN ('BREAKDOWN', 'ACCIDENT', 'DRIVER_UNAVAILABLE', 'TRAFFIC_DELAY',
      'MISSED_PICKUP', 'COMPLAINT', 'VEHICLE_DEFECT', 'SAFETY_CONCERN', 'OTHER')
  ),
  CONSTRAINT "Incident_severity_allowed" CHECK (
    "severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
  ),
  CONSTRAINT "Incident_status_allowed" CHECK (
    "status" IN ('Open', 'Acknowledged', 'In Progress', 'Resolved', 'Closed')
  )
);

CREATE UNIQUE INDEX "Incident_companyId_id_key" ON "Incident"("companyId", "id");
CREATE UNIQUE INDEX "Incident_companyId_reference_key" ON "Incident"("companyId", "reference");
CREATE INDEX "Incident_companyId_status_occurredAt_idx" ON "Incident"("companyId", "status", "occurredAt");
CREATE INDEX "Incident_companyId_tripId_idx" ON "Incident"("companyId", "tripId");
CREATE INDEX "Incident_companyId_vehicleId_idx" ON "Incident"("companyId", "vehicleId");

ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_company_trip_fkey"
  FOREIGN KEY ("companyId", "tripId") REFERENCES "Trip"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_company_vehicle_fkey"
  FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_company_driver_fkey"
  FOREIGN KEY ("companyId", "driverId") REFERENCES "Driver"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_reportedById_fkey"
  FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_assignedResponderId_fkey"
  FOREIGN KEY ("assignedResponderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IncidentStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IncidentStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IncidentStatusHistory_companyId_incidentId_sequence_key"
  ON "IncidentStatusHistory"("companyId", "incidentId", "sequence");
CREATE INDEX "IncidentStatusHistory_companyId_incidentId_sequence_idx"
  ON "IncidentStatusHistory"("companyId", "incidentId", "sequence");

ALTER TABLE "IncidentStatusHistory"
  ADD CONSTRAINT "IncidentStatusHistory_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncidentStatusHistory"
  ADD CONSTRAINT "IncidentStatusHistory_company_incident_fkey"
  FOREIGN KEY ("companyId", "incidentId") REFERENCES "Incident"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IncidentStatusHistory"
  ADD CONSTRAINT "IncidentStatusHistory_allowed_transition" CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'Open')
    OR ("fromStatus" = 'Open' AND "toStatus" IN ('Acknowledged', 'In Progress'))
    OR ("fromStatus" = 'Acknowledged' AND "toStatus" IN ('In Progress', 'Resolved'))
    OR ("fromStatus" = 'In Progress' AND "toStatus" = 'Resolved')
    OR ("fromStatus" = 'Resolved' AND "toStatus" IN ('Closed', 'In Progress'))
  );

CREATE OR REPLACE FUNCTION enforce_incident_status_transition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'Open' THEN
      RAISE EXCEPTION 'Incidents must be created as Open';
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'Open' AND NEW."status" IN ('Acknowledged', 'In Progress'))
      OR (OLD."status" = 'Acknowledged' AND NEW."status" IN ('In Progress', 'Resolved'))
      OR (OLD."status" = 'In Progress' AND NEW."status" = 'Resolved')
      OR (OLD."status" = 'Resolved' AND NEW."status" IN ('Closed', 'In Progress'))
    ) THEN
      RAISE EXCEPTION 'Incident status transition is not approved';
    END IF;
    IF NEW."status" = 'Resolved' AND NEW."resolvedAt" IS NULL THEN
      RAISE EXCEPTION 'Resolving an incident requires a resolution timestamp';
    END IF;
    IF OLD."status" = 'Resolved' AND NEW."status" = 'In Progress' AND NEW."resolvedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Reopening an incident requires clearing the resolution timestamp';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Incident_status_transition_guard"
  BEFORE INSERT OR UPDATE OF "status", "resolvedAt" ON "Incident"
  FOR EACH ROW EXECUTE FUNCTION enforce_incident_status_transition();

CREATE FUNCTION verify_incident_status_history() RETURNS trigger AS $$
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
    SELECT 1 FROM "IncidentStatusHistory"
    WHERE "companyId" = NEW."companyId"
      AND "incidentId" = NEW."id"
      AND "fromStatus" IS NOT DISTINCT FROM expected_from
      AND "toStatus" = expected_to
  ) THEN
    RAISE EXCEPTION 'Every incident status change requires status history';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "Incident_status_history_required"
  AFTER INSERT OR UPDATE ON "Incident"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verify_incident_status_history();

CREATE OR REPLACE FUNCTION prevent_incident_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Incident status history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "IncidentStatusHistory_append_only"
  BEFORE UPDATE OR DELETE ON "IncidentStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_incident_history_mutation();
