-- Phase 4 (D-089) RNT-05: facts recorded at confirmation time. All nullable;
-- they exist only once a request is Confirmed.

ALTER TABLE "RentalRequest"
  ADD COLUMN "acceptedByName" TEXT,
  ADD COLUMN "acceptanceAt" TIMESTAMPTZ(6),
  ADD COLUMN "acceptanceReference" TEXT,
  ADD COLUMN "confirmedWorksheetId" TEXT,
  ADD COLUMN "depositDuePesewas" INTEGER,
  ADD COLUMN "depositReceivedPesewas" INTEGER,
  ADD COLUMN "depositEvidenceReference" TEXT;
