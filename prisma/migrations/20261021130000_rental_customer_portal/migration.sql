-- RNT-09 (D-066): audited rental-customer portal identity link, plus the two
-- customer-withdrawal transitions (Draft/Submitted -> Cancelled). Formal
-- quotation issuance and rental invoicing do not exist yet, so the portal
-- exposes profile, own requests, and explicit no-quotation/no-payment states
-- only; nothing about pricing or payment is invented here.

-- 1. Customer login identity link (unique: one login, one customer record).
ALTER TABLE "Customer" ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_linkedUser_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Withdrawal states: widen the approved rental-request lifecycle with the
-- two customer-withdrawal transitions, in the status CHECK, the history
-- CHECK, and the transition guard function.
ALTER TABLE "RentalRequest"
  DROP CONSTRAINT "RentalRequest_status_allowed";
ALTER TABLE "RentalRequest"
  ADD CONSTRAINT "RentalRequest_status_allowed"
  CHECK ("status" IN ('Draft', 'Submitted', 'Under Review', 'Declined', 'Cancelled'));

ALTER TABLE "RentalRequestStatusHistory"
  DROP CONSTRAINT "RentalRequestStatusHistory_allowed_transition";
ALTER TABLE "RentalRequestStatusHistory"
  ADD CONSTRAINT "RentalRequestStatusHistory_allowed_transition"
  CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'Draft')
    OR ("fromStatus" = 'Draft' AND "toStatus" = 'Submitted')
    OR ("fromStatus" = 'Submitted' AND "toStatus" = 'Under Review')
    OR ("fromStatus" = 'Under Review' AND "toStatus" = 'Declined')
    OR ("fromStatus" = 'Draft' AND "toStatus" = 'Cancelled')
    OR ("fromStatus" = 'Submitted' AND "toStatus" = 'Cancelled')
  );

CREATE OR REPLACE FUNCTION enforce_rental_request_status_transition() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'Draft' THEN
      RAISE EXCEPTION 'Rental requests must be created as Draft';
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT (
      (OLD."status" = 'Draft' AND NEW."status" = 'Submitted')
      OR (OLD."status" = 'Submitted' AND NEW."status" = 'Under Review')
      OR (OLD."status" = 'Under Review' AND NEW."status" = 'Declined')
      OR (OLD."status" = 'Draft' AND NEW."status" = 'Cancelled')
      OR (OLD."status" = 'Submitted' AND NEW."status" = 'Cancelled')
    ) THEN
      RAISE EXCEPTION 'Rental request status transition is not approved';
    END IF;
    IF OLD."status" = 'Draft' AND NEW."status" = 'Submitted' AND (
      NEW."serviceDate" IS NULL OR NEW."departureTime" IS NULL
      OR NEW."pickupLocation" IS NULL OR length(trim(NEW."pickupLocation")) = 0
      OR NEW."destination" IS NULL OR length(trim(NEW."destination")) = 0
      OR NEW."passengerCount" IS NULL OR NEW."requestSource" IS NULL
      OR (NEW."returnTime" IS NULL AND NEW."durationMinutes" IS NULL)
      OR (
        NEW."returnTime" IS NOT NULL AND NEW."returnTime" < NEW."departureTime"
        AND (NEW."returnDate" IS NULL OR NEW."returnDate" <= NEW."serviceDate")
      )
    ) THEN
      RAISE EXCEPTION 'Rental request is missing required submission fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
