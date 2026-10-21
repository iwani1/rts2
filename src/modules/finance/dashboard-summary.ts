export type FinanceStatusTotalInput = {
  status: string;
  invoiceCount: number;
  totalPesewas: number;
};

export type FinanceClientTotalInput = {
  clientId: string;
  clientName: string;
  standingInvoiceCount: number;
  invoicedPesewas: number;
  paidPesewas: number;
};

export type FinanceClientTotal = FinanceClientTotalInput & { outstandingPesewas: number };

const STATUS_ORDER = ['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const;

/**
 * FIN-07 / D-063 pure aggregation. Recognised revenue counts only invoices
 * that have been issued and not voided (ISSUED + PAID); DRAFT is pipeline and
 * VOID is reported separately. Outstanding arrives derived from the payment
 * records, and the structural identity revenue = payments + outstanding is
 * surfaced so the dashboard proves its own tie-out on every response.
 */
export function summariseFinanceDashboard(input: {
  statusTotals: FinanceStatusTotalInput[];
  totalPaymentsPesewas: number;
  outstandingPesewas: number;
  clients: FinanceClientTotalInput[];
}) {
  const byStatus = new Map(input.statusTotals.map((row) => [row.status, row]));
  const totalFor = (status: string) => byStatus.get(status)?.totalPesewas ?? 0;
  const countFor = (status: string) => byStatus.get(status)?.invoiceCount ?? 0;
  const recognizedRevenuePesewas = totalFor('ISSUED') + totalFor('PAID');
  const clients: FinanceClientTotal[] = input.clients
    .map((client) => ({ ...client, outstandingPesewas: client.invoicedPesewas - client.paidPesewas }))
    .sort((a, b) => (b.outstandingPesewas - a.outstandingPesewas) || a.clientName.localeCompare(b.clientName));
  return {
    recognizedRevenuePesewas,
    paymentsReceivedPesewas: input.totalPaymentsPesewas,
    outstandingPesewas: input.outstandingPesewas,
    draftPipelinePesewas: totalFor('DRAFT'),
    draftInvoiceCount: countFor('DRAFT'),
    voidedInvoiceCount: countFor('VOID'),
    voidedTotalPesewas: totalFor('VOID'),
    countsByStatus: STATUS_ORDER.map((status) => ({
      status,
      invoiceCount: countFor(status),
      totalPesewas: totalFor(status),
    })),
    clients,
    reconciliation: {
      recognizedRevenuePesewas,
      paymentsReceivedPesewas: input.totalPaymentsPesewas,
      outstandingPesewas: input.outstandingPesewas,
      reconciles: recognizedRevenuePesewas === input.totalPaymentsPesewas + input.outstandingPesewas,
    },
  };
}
