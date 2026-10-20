ALTER TABLE "Driver"
  ADD CONSTRAINT "Driver_companyId_id_key" UNIQUE ("companyId", "id");

ALTER TABLE "Vehicle"
  ADD COLUMN "usualDriverCompanyId" TEXT,
  ADD COLUMN "usualDriverId" TEXT;

ALTER TABLE "Vehicle"
  ADD CONSTRAINT "Vehicle_usual_driver_company_check"
    CHECK (
      ("usualDriverCompanyId" IS NULL AND "usualDriverId" IS NULL)
      OR (
        "usualDriverCompanyId" IS NOT NULL
        AND "usualDriverId" IS NOT NULL
        AND "usualDriverCompanyId" = "companyId"
      )
    ),
  ADD CONSTRAINT "Vehicle_usualDriverCompanyId_usualDriverId_fkey"
    FOREIGN KEY ("usualDriverCompanyId", "usualDriverId")
    REFERENCES "Driver" ("companyId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Vehicle_companyId_usualDriverId_idx"
  ON "Vehicle" ("companyId", "usualDriverId");
