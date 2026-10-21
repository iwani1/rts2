CREATE TABLE "Location" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "landmarkDescription" TEXT,
  "ghanaDigitalAddress" TEXT,
  "notes" TEXT,
  "archivedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Location_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Location_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Location_name_nonempty" CHECK (length(trim("name")) > 0),
  CONSTRAINT "Location_coordinates_pair" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  CONSTRAINT "Location_latitude_range" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90)),
  CONSTRAINT "Location_longitude_range" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180))
);
CREATE UNIQUE INDEX "Location_companyId_id_key" ON "Location"("companyId", "id");
CREATE INDEX "Location_companyId_archivedAt_name_idx" ON "Location"("companyId", "archivedAt", "name");

CREATE TABLE "Route" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "serviceType" TEXT,
  "originLocationId" TEXT NOT NULL,
  "destinationLocationId" TEXT NOT NULL,
  "plannedStartTime" TEXT,
  "expectedDurationMinutes" INTEGER,
  "capacityRequirement" INTEGER,
  "operatingDays" TEXT[] NOT NULL,
  "shift" TEXT,
  "active" BOOLEAN NOT NULL,
  "notes" TEXT,
  "archivedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Route_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Route_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Route_client_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Route_originLocation_fkey" FOREIGN KEY ("companyId", "originLocationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Route_destinationLocation_fkey" FOREIGN KEY ("companyId", "destinationLocationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Route_name_nonempty" CHECK (length(trim("name")) > 0),
  CONSTRAINT "Route_plannedStartTime_format" CHECK ("plannedStartTime" IS NULL OR "plannedStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "Route_duration_positive" CHECK ("expectedDurationMinutes" IS NULL OR "expectedDurationMinutes" > 0),
  CONSTRAINT "Route_capacity_positive" CHECK ("capacityRequirement" IS NULL OR "capacityRequirement" > 0)
);
CREATE UNIQUE INDEX "Route_companyId_id_key" ON "Route"("companyId", "id");
CREATE UNIQUE INDEX "Route_companyId_reference_key" ON "Route"("companyId", "reference");
CREATE INDEX "Route_companyId_archivedAt_name_idx" ON "Route"("companyId", "archivedAt", "name");
CREATE INDEX "Route_companyId_clientId_archivedAt_idx" ON "Route"("companyId", "clientId", "archivedAt");

CREATE TABLE "RouteStop" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "stopKind" TEXT NOT NULL,
  "plannedOffsetMinutes" INTEGER,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RouteStop_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RouteStop_route_fkey" FOREIGN KEY ("companyId", "routeId") REFERENCES "Route"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RouteStop_location_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RouteStop_kind_allowed" CHECK ("stopKind" IN ('PICKUP', 'DROPOFF', 'PICKUP_AND_DROPOFF')),
  CONSTRAINT "RouteStop_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "RouteStop_offset_nonnegative" CHECK ("plannedOffsetMinutes" IS NULL OR "plannedOffsetMinutes" >= 0)
);
CREATE UNIQUE INDEX "RouteStop_companyId_routeId_sequence_key" ON "RouteStop"("companyId", "routeId", "sequence");
CREATE INDEX "RouteStop_companyId_routeId_idx" ON "RouteStop"("companyId", "routeId");
CREATE INDEX "RouteStop_companyId_locationId_idx" ON "RouteStop"("companyId", "locationId");

CREATE TABLE "RouteSchedule" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "daysOfWeek" TEXT[] NOT NULL,
  "scheduleDate" DATE,
  "shift" TEXT,
  "plannedStartTime" TEXT,
  "active" BOOLEAN NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "RouteSchedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RouteSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RouteSchedule_route_fkey" FOREIGN KEY ("companyId", "routeId") REFERENCES "Route"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RouteSchedule_kind_allowed" CHECK ("kind" IN ('RECURRING', 'ONE_TIME')),
  CONSTRAINT "RouteSchedule_shape" CHECK (
    ("kind" = 'RECURRING' AND cardinality("daysOfWeek") > 0 AND "scheduleDate" IS NULL)
    OR ("kind" = 'ONE_TIME' AND "scheduleDate" IS NOT NULL)
  ),
  CONSTRAINT "RouteSchedule_plannedStartTime_format" CHECK ("plannedStartTime" IS NULL OR "plannedStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
CREATE INDEX "RouteSchedule_companyId_routeId_active_idx" ON "RouteSchedule"("companyId", "routeId", "active");
