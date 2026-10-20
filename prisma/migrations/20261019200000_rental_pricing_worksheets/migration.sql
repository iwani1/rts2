CREATE TABLE "RentalPricingWorksheet" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "lines" JSONB NOT NULL,
  "preTaxSubtotalPesewas" BIGINT NOT NULL,
  "distanceMetres" INTEGER,
  "durationMinutes" INTEGER,
  "reason" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RentalPricingWorksheet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalPricingWorksheet_version_positive" CHECK ("version" > 0),
  CONSTRAINT "RentalPricingWorksheet_subtotal_nonnegative" CHECK ("preTaxSubtotalPesewas" >= 0),
  CONSTRAINT "RentalPricingWorksheet_distance_positive" CHECK ("distanceMetres" IS NULL OR "distanceMetres" > 0),
  CONSTRAINT "RentalPricingWorksheet_duration_positive" CHECK ("durationMinutes" IS NULL OR "durationMinutes" > 0),
  CONSTRAINT "RentalPricingWorksheet_reason_nonempty" CHECK (length(btrim("reason")) >= 8)
);

CREATE UNIQUE INDEX "RentalPricingWorksheet_companyId_requestId_version_key"
  ON "RentalPricingWorksheet"("companyId", "requestId", "version");
CREATE INDEX "RentalPricingWorksheet_companyId_requestId_createdAt_idx"
  ON "RentalPricingWorksheet"("companyId", "requestId", "createdAt");

ALTER TABLE "RentalPricingWorksheet"
  ADD CONSTRAINT "RentalPricingWorksheet_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalPricingWorksheet"
  ADD CONSTRAINT "RentalPricingWorksheet_companyId_requestId_fkey"
  FOREIGN KEY ("companyId", "requestId") REFERENCES "RentalRequest"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RentalPricingWorksheet"
  ADD CONSTRAINT "RentalPricingWorksheet_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_rental_pricing_worksheet_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RentalPricingWorksheet rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "RentalPricingWorksheet_immutable"
  BEFORE UPDATE OR DELETE ON "RentalPricingWorksheet"
  FOR EACH ROW EXECUTE FUNCTION prevent_rental_pricing_worksheet_mutation();
