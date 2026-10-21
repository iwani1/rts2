-- GPS-01 (D-077): append-only vehicle location reports. Rows only ever come
-- from real provider reports; nothing fabricates coordinates.

CREATE TABLE "VehicleLocationReport" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "tripId" TEXT,
  "latitude" DECIMAL(9, 6) NOT NULL,
  "longitude" DECIMAL(9, 6) NOT NULL,
  "accuracyMeters" INTEGER,
  "source" VARCHAR(16) NOT NULL,
  "recordedAt" TIMESTAMPTZ(6) NOT NULL,
  "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VehicleLocationReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehicleLocationReport_source_allowed" CHECK (
    "source" IN ('GPS_DEVICE', 'DRIVER_PHONE', 'SIMULATED')
  ),
  CONSTRAINT "VehicleLocationReport_latitude_range" CHECK ("latitude" >= -90 AND "latitude" <= 90),
  CONSTRAINT "VehicleLocationReport_longitude_range" CHECK ("longitude" >= -180 AND "longitude" <= 180)
);

CREATE INDEX "VehicleLocationReport_companyId_vehicleId_recordedAt_idx"
  ON "VehicleLocationReport"("companyId", "vehicleId", "recordedAt");
CREATE INDEX "VehicleLocationReport_companyId_recordedAt_idx"
  ON "VehicleLocationReport"("companyId", "recordedAt");

ALTER TABLE "VehicleLocationReport"
  ADD CONSTRAINT "VehicleLocationReport_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleLocationReport"
  ADD CONSTRAINT "VehicleLocationReport_company_vehicle_fkey"
  FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleLocationReport"
  ADD CONSTRAINT "VehicleLocationReport_company_trip_fkey"
  FOREIGN KEY ("companyId", "tripId") REFERENCES "Trip"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_location_report_mutation() RETURNS trigger AS $$
BEGIN
  -- Retention purge (D-077) runs with SET LOCAL richie.location_purge = 'on'
  -- inside its own audited transaction; every other delete, and all updates,
  -- are refused. Location history is otherwise append-only.
  IF TG_OP = 'DELETE' AND current_setting('richie.location_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Vehicle location history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VehicleLocationReport_append_only"
  BEFORE UPDATE OR DELETE ON "VehicleLocationReport"
  FOR EACH ROW EXECUTE FUNCTION prevent_location_report_mutation();
