ALTER TABLE "MaintenanceWorkOrder"
  DROP CONSTRAINT "MaintenanceWorkOrder_status_check";
ALTER TABLE "MaintenanceWorkOrder"
  ADD CONSTRAINT "MaintenanceWorkOrder_status_check" CHECK ("status" IN (
    'Reported', 'Awaiting Inspection', 'Approved', 'In Progress', 'Awaiting Parts',
    'Awaiting Review', 'Completed', 'Closed', 'Cancelled'
  ));

CREATE TABLE "MaintenanceWorkOrderStatusHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaintenanceWorkOrderStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceWorkOrderStatusHistory_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "MaintenanceWorkOrderStatusHistory_reason_nonempty" CHECK (length(btrim("reason")) >= 8),
  CONSTRAINT "MaintenanceWorkOrderStatusHistory_transition_check" CHECK (
    ("fromStatus" IS NULL AND "toStatus" = 'Reported') OR
    ("fromStatus" = 'Reported' AND "toStatus" IN ('Awaiting Inspection', 'Cancelled')) OR
    ("fromStatus" = 'Awaiting Inspection' AND "toStatus" IN ('Approved', 'Cancelled')) OR
    ("fromStatus" = 'Approved' AND "toStatus" = 'In Progress') OR
    ("fromStatus" = 'In Progress' AND "toStatus" IN ('Awaiting Parts', 'Awaiting Review')) OR
    ("fromStatus" = 'Awaiting Parts' AND "toStatus" = 'In Progress') OR
    ("fromStatus" = 'Awaiting Review' AND "toStatus" = 'Completed') OR
    ("fromStatus" = 'Completed' AND "toStatus" = 'Closed')
  )
);

CREATE UNIQUE INDEX "MaintenanceWorkOrderStatusHistory_companyId_workOrderId_sequence_key"
  ON "MaintenanceWorkOrderStatusHistory"("companyId", "workOrderId", "sequence");
CREATE INDEX "MaintenanceWorkOrderStatusHistory_companyId_workOrderId_createdAt_idx"
  ON "MaintenanceWorkOrderStatusHistory"("companyId", "workOrderId", "createdAt");

ALTER TABLE "MaintenanceWorkOrderStatusHistory"
  ADD CONSTRAINT "MaintenanceWorkOrderStatusHistory_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrderStatusHistory"
  ADD CONSTRAINT "MaintenanceWorkOrderStatusHistory_companyId_workOrderId_fkey"
  FOREIGN KEY ("companyId", "workOrderId") REFERENCES "MaintenanceWorkOrder"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaintenanceWorkOrderStatusHistory"
  ADD CONSTRAINT "MaintenanceWorkOrderStatusHistory_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION validate_maintenance_work_order_history_append() RETURNS trigger AS $$
DECLARE
  previous_sequence INTEGER;
  previous_status TEXT;
BEGIN
  SELECT "sequence", "toStatus" INTO previous_sequence, previous_status
  FROM "MaintenanceWorkOrderStatusHistory"
  WHERE "companyId" = NEW."companyId" AND "workOrderId" = NEW."workOrderId"
  ORDER BY "sequence" DESC LIMIT 1;
  IF previous_sequence IS NULL THEN
    IF NEW."sequence" <> 1 OR NEW."fromStatus" IS NOT NULL OR NEW."toStatus" <> 'Reported' THEN
      RAISE EXCEPTION 'First work-order history event must initialize Reported at sequence 1';
    END IF;
  ELSIF NEW."sequence" <> previous_sequence + 1 OR NEW."fromStatus" IS DISTINCT FROM previous_status THEN
    RAISE EXCEPTION 'Work-order history sequence or from-status does not follow the prior event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MaintenanceWorkOrderStatusHistory_append_guard"
  BEFORE INSERT ON "MaintenanceWorkOrderStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION validate_maintenance_work_order_history_append();

CREATE FUNCTION prevent_maintenance_work_order_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Maintenance work-order status history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MaintenanceWorkOrderStatusHistory_immutable"
  BEFORE UPDATE OR DELETE ON "MaintenanceWorkOrderStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION prevent_maintenance_work_order_history_mutation();

CREATE FUNCTION require_maintenance_work_order_status_history() RETURNS trigger AS $$
DECLARE latest_status TEXT;
BEGIN
  SELECT "toStatus" INTO latest_status
  FROM "MaintenanceWorkOrderStatusHistory"
  WHERE "companyId" = NEW."companyId" AND "workOrderId" = NEW."id"
  ORDER BY "sequence" DESC
  LIMIT 1;
  IF latest_status IS NULL OR latest_status <> NEW."status" THEN
    RAISE EXCEPTION 'Maintenance work-order status must match its latest history event';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "MaintenanceWorkOrder_status_history_guard"
  AFTER INSERT OR UPDATE OF "status" ON "MaintenanceWorkOrder"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_maintenance_work_order_status_history();
