ALTER TABLE "RentalRequest"
  DROP CONSTRAINT "RentalRequest_status_allowed";
ALTER TABLE "RentalRequest"
  ADD CONSTRAINT "RentalRequest_status_allowed"
  CHECK ("status" IN ('Draft', 'Submitted', 'Under Review', 'Declined'));

ALTER TABLE "RentalRequestStatusHistory"
  DROP CONSTRAINT "RentalRequestStatusHistory_allowed_transition";
ALTER TABLE "RentalRequestStatusHistory"
  ADD CONSTRAINT "RentalRequestStatusHistory_allowed_transition"
  CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'Draft')
    OR ("fromStatus" = 'Draft' AND "toStatus" = 'Submitted')
    OR ("fromStatus" = 'Submitted' AND "toStatus" = 'Under Review')
    OR ("fromStatus" = 'Under Review' AND "toStatus" = 'Declined')
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
