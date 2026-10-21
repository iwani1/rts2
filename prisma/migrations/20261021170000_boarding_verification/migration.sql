-- DRV-03 (D-073): per-booking boarding codes and recorded verification
-- attempts. DB-only slice; enforcement lives in the driver event service.

CREATE TABLE "BookingBoardingCode" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "code" VARCHAR(6) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "usedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "BookingBoardingCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingBoardingCode_code_shape" CHECK ("code" ~ '^[0-9]{6}$')
);

CREATE UNIQUE INDEX "BookingBoardingCode_companyId_bookingId_key"
  ON "BookingBoardingCode"("companyId", "bookingId");
CREATE INDEX "BookingBoardingCode_companyId_tripId_idx"
  ON "BookingBoardingCode"("companyId", "tripId");

ALTER TABLE "BookingBoardingCode"
  ADD CONSTRAINT "BookingBoardingCode_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingBoardingCode"
  ADD CONSTRAINT "BookingBoardingCode_company_booking_fkey"
  FOREIGN KEY ("companyId", "bookingId") REFERENCES "Booking"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingBoardingCode"
  ADD CONSTRAINT "BookingBoardingCode_company_trip_fkey"
  FOREIGN KEY ("companyId", "tripId") REFERENCES "Trip"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BoardingVerificationAttempt" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "method" VARCHAR(16) NOT NULL,
  "result" VARCHAR(16) NOT NULL,
  "reason" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BoardingVerificationAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BoardingVerificationAttempt_method_allowed" CHECK ("method" IN ('CODE', 'MANUAL')),
  CONSTRAINT "BoardingVerificationAttempt_result_allowed" CHECK ("result" IN ('SUCCESS', 'FAILED'))
);

CREATE INDEX "BoardingVerificationAttempt_companyId_bookingId_createdAt_idx"
  ON "BoardingVerificationAttempt"("companyId", "bookingId", "createdAt");
CREATE INDEX "BoardingVerificationAttempt_companyId_tripId_createdAt_idx"
  ON "BoardingVerificationAttempt"("companyId", "tripId", "createdAt");

ALTER TABLE "BoardingVerificationAttempt"
  ADD CONSTRAINT "BoardingVerificationAttempt_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardingVerificationAttempt"
  ADD CONSTRAINT "BoardingVerificationAttempt_company_booking_fkey"
  FOREIGN KEY ("companyId", "bookingId") REFERENCES "Booking"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardingVerificationAttempt"
  ADD CONSTRAINT "BoardingVerificationAttempt_company_trip_fkey"
  FOREIGN KEY ("companyId", "tripId") REFERENCES "Trip"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardingVerificationAttempt"
  ADD CONSTRAINT "BoardingVerificationAttempt_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
