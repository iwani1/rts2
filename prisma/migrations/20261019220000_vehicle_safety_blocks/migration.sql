CREATE TABLE "VehicleSafetyBlock" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "appliedById" TEXT NOT NULL,
  "appliedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedById" TEXT,
  "releasedAt" TIMESTAMPTZ(6),
  "releaseReason" VARCHAR(500),
  "workCompletedAt" TIMESTAMPTZ(6),
  "inspectionResults" TEXT,
  "inspectionPassed" BOOLEAN,
  CONSTRAINT "VehicleSafetyBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehicleSafetyBlock_status_check" CHECK ("status" IN ('Under Maintenance', 'Out of Service', 'Pending Inspection')),
  CONSTRAINT "VehicleSafetyBlock_reason_nonempty" CHECK (length(btrim("reason")) >= 8),
  CONSTRAINT "VehicleSafetyBlock_release_fields_check" CHECK (
    ("releasedAt" IS NULL AND "releasedById" IS NULL AND "releaseReason" IS NULL AND "workCompletedAt" IS NULL AND "inspectionResults" IS NULL AND "inspectionPassed" IS NULL)
    OR
    ("releasedAt" IS NOT NULL AND "releasedById" IS NOT NULL AND COALESCE(length(btrim("releaseReason")), 0) >= 8 AND "workCompletedAt" IS NOT NULL AND COALESCE(length(btrim("inspectionResults")), 0) >= 8 AND "inspectionPassed" IS TRUE AND "workCompletedAt" >= "appliedAt" AND "workCompletedAt" <= "releasedAt")
  )
);

CREATE UNIQUE INDEX "VehicleSafetyBlock_one_active_per_vehicle_key"
  ON "VehicleSafetyBlock"("companyId", "vehicleId") WHERE "releasedAt" IS NULL;
CREATE INDEX "VehicleSafetyBlock_companyId_vehicleId_appliedAt_idx"
  ON "VehicleSafetyBlock"("companyId", "vehicleId", "appliedAt");

ALTER TABLE "VehicleSafetyBlock"
  ADD CONSTRAINT "VehicleSafetyBlock_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleSafetyBlock"
  ADD CONSTRAINT "VehicleSafetyBlock_companyId_vehicleId_fkey"
  FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleSafetyBlock"
  ADD CONSTRAINT "VehicleSafetyBlock_appliedById_fkey"
  FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleSafetyBlock"
  ADD CONSTRAINT "VehicleSafetyBlock_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION enforce_vehicle_safety_block_lifecycle() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Vehicle safety blocks cannot be deleted';
  END IF;

  IF OLD."releasedAt" IS NOT NULL OR NEW."releasedAt" IS NULL THEN
    RAISE EXCEPTION 'Vehicle safety blocks may only be released once';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['releasedById', 'releasedAt', 'releaseReason', 'workCompletedAt', 'inspectionResults', 'inspectionPassed'])
     <> (to_jsonb(OLD) - ARRAY['releasedById', 'releasedAt', 'releaseReason', 'workCompletedAt', 'inspectionResults', 'inspectionPassed']) THEN
    RAISE EXCEPTION 'Applied vehicle safety block details are immutable';
  END IF;
  IF NEW."releasedById" IS NULL OR COALESCE(length(btrim(NEW."releaseReason")), 0) < 8 OR NEW."workCompletedAt" IS NULL
     OR COALESCE(length(btrim(NEW."inspectionResults")), 0) < 8 OR NEW."inspectionPassed" IS DISTINCT FROM TRUE
     OR NEW."workCompletedAt" < OLD."appliedAt" OR NEW."workCompletedAt" > NEW."releasedAt" THEN
    RAISE EXCEPTION 'A safety block release requires completed work and a passed inspection';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VehicleSafetyBlock_lifecycle_guard"
  BEFORE UPDATE OR DELETE ON "VehicleSafetyBlock"
  FOR EACH ROW EXECUTE FUNCTION enforce_vehicle_safety_block_lifecycle();
