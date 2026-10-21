-- Phase 5 (D-090/5C): explicit invoice due dates. Recorded by the finance
-- officer at issue time (required by the services, never a silent default);
-- nullable so pre-existing invoices honestly show "no due date recorded".
-- RentalInvoice already carries the column (migration 40).

ALTER TABLE "CorporateInvoice" ADD COLUMN "dueDate" DATE;
