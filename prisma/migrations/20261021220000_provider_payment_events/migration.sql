-- FIN-04 (D-084): verified provider webhook events land in a staging inbox.
-- Idempotent on (companyId, provider, providerReference): repeated delivery
-- can never double-record. Events become invoice payments only through the
-- governed apply path in the service layer.

CREATE TABLE "PaymentProviderEvent" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerReference" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "amountPesewas" INTEGER,
  "currency" TEXT,
  "invoiceReference" TEXT,
  "paidDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "note" TEXT,
  "rawPayload" JSONB NOT NULL,
  "appliedInvoiceId" TEXT,
  "appliedPaymentId" TEXT,
  "appliedById" TEXT,
  "appliedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentProviderEvent_status_check" CHECK ("status" IN ('RECEIVED', 'APPLIED', 'IGNORED')),
  CONSTRAINT "PaymentProviderEvent_amount_positive" CHECK ("amountPesewas" IS NULL OR "amountPesewas" > 0),
  CONSTRAINT "PaymentProviderEvent_applied_shape" CHECK (
    ("status" = 'APPLIED' AND "appliedInvoiceId" IS NOT NULL AND "appliedPaymentId" IS NOT NULL AND "appliedById" IS NOT NULL AND "appliedAt" IS NOT NULL)
    OR ("status" <> 'APPLIED' AND "appliedInvoiceId" IS NULL AND "appliedPaymentId" IS NULL AND "appliedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "PaymentProviderEvent_companyId_provider_providerReference_key"
  ON "PaymentProviderEvent"("companyId", "provider", "providerReference");
CREATE INDEX "PaymentProviderEvent_companyId_status_createdAt_idx"
  ON "PaymentProviderEvent"("companyId", "status", "createdAt");

ALTER TABLE "PaymentProviderEvent"
  ADD CONSTRAINT "PaymentProviderEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderEvent"
  ADD CONSTRAINT "PaymentProviderEvent_companyId_appliedInvoiceId_fkey"
  FOREIGN KEY ("companyId", "appliedInvoiceId") REFERENCES "CorporateInvoice"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderEvent"
  ADD CONSTRAINT "PaymentProviderEvent_appliedPaymentId_fkey"
  FOREIGN KEY ("appliedPaymentId") REFERENCES "InvoicePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentProviderEvent"
  ADD CONSTRAINT "PaymentProviderEvent_appliedById_fkey"
  FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
