-- PAX-01 (D-065): passenger portal identity link and feedback.
--
-- * Employee gains a unique nullable userId: the explicit, audited link
--   between a passenger login and exactly one employee record (mirrors the
--   Driver account link). Existing rows are untouched (NULL = not linked).
-- * PassengerFeedback is append-only (trigger-enforced), one row per booking
--   (unique companyId+bookingId), recorded only for Completed journeys.

-- 1) Passenger identity link on Employee.
ALTER TABLE "Employee" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Feedback records.
CREATE TABLE "PassengerFeedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "rating" INTEGER,
    "comment" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassengerFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PassengerFeedback_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PassengerFeedback_booking_fkey" FOREIGN KEY ("companyId", "bookingId") REFERENCES "Booking"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PassengerFeedback_employee_fkey" FOREIGN KEY ("companyId", "employeeId") REFERENCES "Employee"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PassengerFeedback_rating_range" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5))
);
CREATE UNIQUE INDEX "PassengerFeedback_companyId_bookingId_key" ON "PassengerFeedback"("companyId", "bookingId");
CREATE INDEX "PassengerFeedback_companyId_employeeId_createdAt_idx" ON "PassengerFeedback"("companyId", "employeeId", "createdAt");

-- 3) Feedback is append-only.
CREATE FUNCTION prevent_passenger_feedback_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PassengerFeedback rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PassengerFeedback_immutable"
  BEFORE UPDATE OR DELETE ON "PassengerFeedback"
  FOR EACH ROW EXECUTE FUNCTION prevent_passenger_feedback_mutation();
