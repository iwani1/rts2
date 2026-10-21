-- Phase 4 (D-089): rental confirmation/assignment/completion/cancellation.
-- The RentalAssignment ledger is the authoritative reservation record;
-- PostgreSQL exclusion constraints make double-booking impossible at the
-- database (brief section 5.1), and the configured buffers are checked in
-- the service on top of them (D-031/D-033).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "RentalRequest" DROP CONSTRAINT "RentalRequest_status_allowed";
ALTER TABLE "RentalRequest" ADD CONSTRAINT "RentalRequest_status_allowed"
  CHECK ("status" IN ('Draft', 'Submitted', 'Under Review', 'Declined', 'Cancelled', 'Confirmed', 'Assigned', 'Completed'));

CREATE TABLE "RentalAssignment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "driverId" TEXT,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "releasedAt" TIMESTAMPTZ(6),
  "releaseKind" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "RentalAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalAssignment_status_check" CHECK ("status" IN ('ACTIVE', 'RELEASED', 'REPLACED')),
  CONSTRAINT "RentalAssignment_window_order" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "RentalAssignment_release_shape" CHECK (
    ("status" = 'ACTIVE' AND "releasedAt" IS NULL AND "releaseKind" IS NULL)
    OR ("status" IN ('RELEASED', 'REPLACED') AND "releasedAt" IS NOT NULL)
  ),
  CONSTRAINT "RentalAssignment_resource_present" CHECK ("vehicleId" IS NOT NULL OR "driverId" IS NOT NULL)
);

CREATE INDEX "RentalAssignment_companyId_requestId_status_idx" ON "RentalAssignment"("companyId", "requestId", "status");
CREATE INDEX "RentalAssignment_companyId_vehicleId_status_idx" ON "RentalAssignment"("companyId", "vehicleId", "status");
CREATE INDEX "RentalAssignment_companyId_driverId_status_idx" ON "RentalAssignment"("companyId", "driverId", "status");

ALTER TABLE "RentalAssignment"
  ADD CONSTRAINT "RentalAssignment_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalAssignment"
  ADD CONSTRAINT "RentalAssignment_company_request_fkey"
  FOREIGN KEY ("companyId", "requestId") REFERENCES "RentalRequest"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalAssignment"
  ADD CONSTRAINT "RentalAssignment_company_vehicle_fkey"
  FOREIGN KEY ("companyId", "vehicleId") REFERENCES "Vehicle"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalAssignment"
  ADD CONSTRAINT "RentalAssignment_company_driver_fkey"
  FOREIGN KEY ("companyId", "driverId") REFERENCES "Driver"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalAssignment"
  ADD CONSTRAINT "RentalAssignment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalAssignment" ADD CONSTRAINT "RentalAssignment_vehicle_no_overlap"
  EXCLUDE USING gist ("vehicleId" WITH =, tstzrange("startsAt", "endsAt") WITH &&)
  WHERE ("status" = 'ACTIVE' AND "vehicleId" IS NOT NULL);
ALTER TABLE "RentalAssignment" ADD CONSTRAINT "RentalAssignment_driver_no_overlap"
  EXCLUDE USING gist ("driverId" WITH =, tstzrange("startsAt", "endsAt") WITH &&)
  WHERE ("status" = 'ACTIVE' AND "driverId" IS NOT NULL);

CREATE TABLE "RentalCompletion" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "actualDepartureAt" TIMESTAMPTZ(6) NOT NULL,
  "actualReturnAt" TIMESTAMPTZ(6) NOT NULL,
  "vehicleReturnedAt" TIMESTAMPTZ(6) NOT NULL,
  "actualDistanceMetres" INTEGER,
  "damageNotes" TEXT,
  "customerFeedback" TEXT,
  "depositReceivedPesewas" INTEGER NOT NULL,
  "additionalChargesPesewas" INTEGER NOT NULL,
  "chargesDescription" TEXT NOT NULL,
  "quotedSubtotalPesewas" BIGINT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMPTZ(6),
  "decisionReason" TEXT,
  "decisionChargesPesewas" INTEGER,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "RentalCompletion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalCompletion_status_check" CHECK ("status" IN ('SUBMITTED', 'APPROVED', 'RETURNED')),
  CONSTRAINT "RentalCompletion_amounts_nonnegative" CHECK (
    "depositReceivedPesewas" >= 0 AND "additionalChargesPesewas" >= 0
    AND ("decisionChargesPesewas" IS NULL OR "decisionChargesPesewas" >= 0)
    AND ("actualDistanceMetres" IS NULL OR "actualDistanceMetres" >= 0)
  ),
  CONSTRAINT "RentalCompletion_decision_shape" CHECK (
    ("status" = 'SUBMITTED' AND "decidedById" IS NULL AND "decidedAt" IS NULL)
    OR ("status" IN ('APPROVED', 'RETURNED') AND "decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL AND "decisionReason" IS NOT NULL)
  )
);

CREATE INDEX "RentalCompletion_companyId_requestId_status_idx" ON "RentalCompletion"("companyId", "requestId", "status");

ALTER TABLE "RentalCompletion"
  ADD CONSTRAINT "RentalCompletion_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalCompletion"
  ADD CONSTRAINT "RentalCompletion_company_request_fkey"
  FOREIGN KEY ("companyId", "requestId") REFERENCES "RentalRequest"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalCompletion"
  ADD CONSTRAINT "RentalCompletion_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalCompletion"
  ADD CONSTRAINT "RentalCompletion_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
