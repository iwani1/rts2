-- MNT-03 (D-075): preventive-maintenance service plans. Reminder state is
-- computed from these baselines; nothing here auto-completes maintenance.

CREATE TABLE "VehicleServicePlan" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "intervalDays" INTEGER,
  "intervalKm" INTEGER,
  "lastServiceDate" DATE NOT NULL,
  "lastServiceOdometerKm" DECIMAL(12, 2),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "VehicleServicePlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VehicleServicePlan_intervalDays_positive" CHECK ("intervalDays" IS NULL OR "intervalDays" > 0),
  CONSTRAINT "VehicleServicePlan_intervalKm_positive" CHECK ("intervalKm" IS NULL OR "intervalKm" > 0),
  CONSTRAINT "VehicleServicePlan_odometer_nonnegative" CHECK ("lastServiceOdometerKm" IS NULL OR "lastServiceOdometerKm" >= 0)
);

CREATE UNIQUE INDEX "VehicleServicePlan_companyId_vehicleId_key"
  ON "VehicleServicePlan"("companyId", "vehicleId");
CREATE INDEX "VehicleServicePlan_companyId_vehicleId_idx"
  ON "VehicleServicePlan"("companyId", "vehicleId");

ALTER TABLE "VehicleServicePlan"
  ADD CONSTRAINT "VehicleServicePlan_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleServicePlan"
  ADD CONSTRAINT "VehicleServicePlan_company_vehicle_fkey"
  FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
