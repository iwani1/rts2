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

export type ExpenseCategoryTotal = {
  category: string;
  expenseCount: number;
  amountPesewas: number;
};

export type TripCostInput = {
  tripId: string;
  tripDate: string;
  approvedCostPesewas: number;
  completedJourneys: number;
};

export type TripCost = TripCostInput & {
  costPerPassengerPesewas: number | null;
};

export type DashboardMargin =
  | { status: 'INSUFFICIENT_DATA'; reason: string; basis: 'window' | 'all-time' }
  | {
      status: 'ESTIMATED';
      basis: 'window' | 'all-time';
      revenuePesewas: number;
      approvedCostsPesewas: number;
      marginPesewas: number;
    };

/**
 * FIN-05R / D-082 / KPIS.md: only Approved expenses are attributable cost.
 * Margin is estimated only when approved costs exist and revenue (on the
 * matched basis) is positive; it is never presented as audited profit.
 * Cost per passenger divides a completed trip's approved cost by its
 * Completed (boarded) bookings, and is omitted when there were none.
 */
export function summariseCostsAndMargin(input: {
  approvedByCategory: ExpenseCategoryTotal[];
  pendingCount: number;
  pendingPesewas: number;
  tripCosts: TripCostInput[];
  revenuePesewas: number;
  basis: 'window' | 'all-time';
}): {
  approvedExpensesPesewas: number;
  approvedExpenseCount: number;
  margin: DashboardMargin;
  tripCosts: TripCost[];
} {
  const approvedExpensesPesewas = input.approvedByCategory
    .reduce((sum, row) => sum + row.amountPesewas, 0);
  const approvedExpenseCount = input.approvedByCategory
    .reduce((sum, row) => sum + row.expenseCount, 0);
  const margin: DashboardMargin = approvedExpensesPesewas > 0 && input.revenuePesewas > 0
    ? {
        status: 'ESTIMATED',
        basis: input.basis,
        revenuePesewas: input.revenuePesewas,
        approvedCostsPesewas: approvedExpensesPesewas,
        marginPesewas: input.revenuePesewas - approvedExpensesPesewas,
      }
    : {
        status: 'INSUFFICIENT_DATA',
        basis: input.basis,
        reason: approvedExpensesPesewas === 0
          ? 'No approved expenses fall in this basis yet; unapproved or rejected records are never treated as cost.'
          : 'Recognised revenue on this basis is zero, so a margin figure would be meaningless.',
      };
  return {
    approvedExpensesPesewas,
    approvedExpenseCount,
    margin,
    tripCosts: input.tripCosts.map((row) => ({
      ...row,
      costPerPassengerPesewas: row.completedJourneys > 0
        ? Math.round(row.approvedCostPesewas / row.completedJourneys)
        : null,
    })),
  };
}
