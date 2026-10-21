export type ProviderEventRow = {
  id: string;
  providerReference: string;
  amountPesewas: number | null;
  status: string;
  appliedPaymentId: string | null;
};

export type PaymentRow = {
  id: string;
  method: string | null;
  reference: string | null;
  amountPesewas: number;
};

export type ReconciliationSummary = {
  providerEventsInPeriod: number;
  providerReceivedCount: number;
  providerReceivedPesewas: number;
  providerAppliedCount: number;
  providerAppliedPesewas: number;
  recordedPaymentsCount: number;
  recordedPaymentsPesewas: number;
  recordedProviderPaymentsPesewas: number;
  discrepancies: {
    unappliedProviderEvents: Array<{ eventId: string; providerReference: string; amountPesewas: number | null }>;
    amountMismatches: Array<{ eventId: string; providerReference: string; eventPesewas: number; paymentPesewas: number }>;
    unknownProviderPayments: Array<{ paymentId: string; reference: string; amountPesewas: number }>;
  };
  reconciles: boolean;
};

/**
 * FIN-08 / D-085 matcher. Provider events applied to payments must agree in
 * reference and amount; provider money still RECEIVED and local payments
 * claiming a provider reference the provider never sent are discrepancies.
 */
export function matchReconciliation(input: {
  providerEvents: ProviderEventRow[];
  payments: PaymentRow[];
  providerMethodLabel: string;
}): ReconciliationSummary {
  const paymentsById = new Map(input.payments.map((row) => [row.id, row]));
  const knownReferences = new Set(
    input.providerEvents.map((row) => row.providerReference),
  );

  const unappliedProviderEvents = input.providerEvents
    .filter((row) => row.status === 'RECEIVED')
    .map((row) => ({ eventId: row.id, providerReference: row.providerReference, amountPesewas: row.amountPesewas }));
  const amountMismatches: ReconciliationSummary['discrepancies']['amountMismatches'] = [];
  let providerAppliedCount = 0;
  let providerAppliedPesewas = 0;
  for (const event of input.providerEvents) {
    if (event.status !== 'APPLIED') continue;
    providerAppliedCount += 1;
    providerAppliedPesewas += event.amountPesewas ?? 0;
    const payment = event.appliedPaymentId ? paymentsById.get(event.appliedPaymentId) : undefined;
    if (payment && event.amountPesewas !== null && payment.amountPesewas !== event.amountPesewas) {
      amountMismatches.push({
        eventId: event.id, providerReference: event.providerReference,
        eventPesewas: event.amountPesewas, paymentPesewas: payment.amountPesewas,
      });
    }
  }
  const providerPayments = input.payments.filter((row) => row.method === input.providerMethodLabel);
  const unknownProviderPayments = providerPayments
    .filter((row) => !row.reference || !knownReferences.has(row.reference))
    .map((row) => ({ paymentId: row.id, reference: row.reference ?? '', amountPesewas: row.amountPesewas }));

  const providerReceived = input.providerEvents.filter((row) => row.status === 'RECEIVED');
  const discrepancies = { unappliedProviderEvents, amountMismatches, unknownProviderPayments };
  return {
    providerEventsInPeriod: input.providerEvents.length,
    providerReceivedCount: providerReceived.length,
    providerReceivedPesewas: providerReceived.reduce((sum, row) => sum + (row.amountPesewas ?? 0), 0),
    providerAppliedCount,
    providerAppliedPesewas,
    recordedPaymentsCount: input.payments.length,
    recordedPaymentsPesewas: input.payments.reduce((sum, row) => sum + row.amountPesewas, 0),
    recordedProviderPaymentsPesewas: providerPayments.reduce((sum, row) => sum + row.amountPesewas, 0),
    discrepancies,
    reconciles: unappliedProviderEvents.length === 0
      && amountMismatches.length === 0
      && unknownProviderPayments.length === 0,
  };
}
