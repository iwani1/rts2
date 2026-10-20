CREATE UNIQUE INDEX "Vehicle_companyId_id_key" ON "Vehicle"("companyId", "id");

CREATE TABLE "MaintenanceWorkOrder" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "reference" VARCHAR(32) NOT NULL,
  "reportedFault" VARCHAR(2000) NOT NULL,
  "workType" VARCHAR(120),
  "priority" VARCHAR(40),
  "dateReported" DATE NOT NULL,
  "odometerValue" DECIMAL(12,2),
  "odometerUnit" TEXT,
  "safetyRelated" BOOLEAN NOT NULL,
  "requiredWork" TEXT,
  "parts" TEXT,
  "labourCostPesewas" BIGINT,
  "partsCostPesewas" BIGINT,
  "otherCostPesewas" BIGINT,
  "inspectionResults" TEXT,
  "completionDate" TIMESTAMPTZ(6),
  "status" TEXT NOT NULL DEFAULT 'Reported',
  "reason" VARCHAR(500) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "MaintenanceWorkOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceWorkOrder_reference_format" CHECK ("reference" ~ '^WO-[A-F0-9]{16}$'),
  CONSTRAINT "MaintenanceWorkOrder_fault_nonempty" CHECK (length(btrim("reportedFault")) >= 8),
  CONSTRAINT "MaintenanceWorkOrder_reason_nonempty" CHECK (length(btrim("reason")) >= 8),
  CONSTRAINT "MaintenanceWorkOrder_odometer_pair" CHECK (
    ("odometerValue" IS NULL AND "odometerUnit" IS NULL) OR
    ("odometerValue" >= 0 AND "odometerUnit" IN ('KM', 'MILE'))
  ),
  CONSTRAINT "MaintenanceWorkOrder_costs_nonnegative" CHECK (
    ("labourCostPesewas" IS NULL OR "labourCostPesewas" >= 0) AND
    ("partsCostPesewas" IS NULL OR "partsCostPesewas" >= 0) AND
    ("otherCostPesewas" IS NULL OR "otherCostPesewas" >= 0)
  ),
  CONSTRAINT "MaintenanceWorkOrder_status_check" CHECK ("status" = 'Reported'),
  CONSTRAINT "MaintenanceWorkOrder_safety_intake_guard" CHECK ("safetyRelated" = FALSE)
);

CREATE UNIQUE INDEX "MaintenanceWorkOrder_companyId_reference_key"
  ON "MaintenanceWorkOrder"("companyId", "reference");
CREATE UNIQUE INDEX "MaintenanceWorkOrder_companyId_id_key"
  ON "MaintenanceWorkOrder"("companyId", "id");
CREATE INDEX "MaintenanceWorkOrder_companyId_status_dateReported_idx"
  ON "MaintenanceWorkOrder"("companyId", "status", "dateReported");
CREATE INDEX "MaintenanceWorkOrder_companyId_vehicleId_dateReported_idx"
  ON "MaintenanceWorkOrder"("companyId", "vehicleId", "dateReported");

ALTER TABLE "MaintenanceWorkOrder"
  ADD CONSTRAINT "MaintenanceWorkOrder_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder"
  ADD CONSTRAINT "MaintenanceWorkOrder_companyId_vehicleId_fkey"
  FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrder"
  ADD CONSTRAINT "MaintenanceWorkOrder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
