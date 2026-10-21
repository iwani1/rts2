-- Phase 4 (D-089): widen the enforced rental-request transition pairs to the
-- full lifecycle matrix, matching src/modules/rentals/rental-request-transitions.ts.
-- The trigger's Draft->Submitted completeness rules are unchanged.

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
      OR (OLD."status" = 'Under Review' AND NEW."status" = 'Confirmed')
      OR (OLD."status" = 'Confirmed' AND NEW."status" = 'Assigned')
      OR (OLD."status" = 'Confirmed' AND NEW."status" = 'Completed')
      OR (OLD."status" = 'Assigned' AND NEW."status" = 'Completed')
      OR (OLD."status" = 'Confirmed' AND NEW."status" = 'Cancelled')
      OR (OLD."status" = 'Assigned' AND NEW."status" = 'Cancelled')
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
    OR ("fromStatus" = 'Under Review' AND "toStatus" = 'Confirmed')
    OR ("fromStatus" = 'Confirmed' AND "toStatus" = 'Assigned')
    OR ("fromStatus" = 'Confirmed' AND "toStatus" = 'Completed')
    OR ("fromStatus" = 'Assigned' AND "toStatus" = 'Completed')
    OR ("fromStatus" = 'Confirmed' AND "toStatus" = 'Cancelled')
    OR ("fromStatus" = 'Assigned' AND "toStatus" = 'Cancelled')
  );
