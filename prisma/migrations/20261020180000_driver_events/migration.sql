ALTER TABLE "Driver" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DriverEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "summary" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriverEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DriverEvent_trip_fkey" FOREIGN KEY ("companyId", "tripId") REFERENCES "Trip"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DriverEvent_driver_fkey" FOREIGN KEY ("companyId", "driverId") REFERENCES "Driver"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DriverEvent_actor_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DriverEvent_type_allowed" CHECK ("eventType" IN ('START', 'DELAY', 'RESUME', 'INTERRUPT', 'COMPLETE', 'BOARD', 'NO_SHOW', 'REPORT_DEFECT')),
  CONSTRAINT "DriverEvent_key_nonempty" CHECK (length(trim("idempotencyKey")) > 0)
);
CREATE UNIQUE INDEX "DriverEvent_companyId_tripId_idempotencyKey_key" ON "DriverEvent"("companyId", "tripId", "idempotencyKey");
CREATE INDEX "DriverEvent_companyId_driverId_createdAt_idx" ON "DriverEvent"("companyId", "driverId", "createdAt");
