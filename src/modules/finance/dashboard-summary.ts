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

export type InvoiceAgeingInput = {
  kind: 'CORPORATE' | 'RENTAL';
  dueDate: string | null;
  outstandingPesewas: number;
};

export type InvoiceAgeingBucket = {
  bucket: 'CURRENT' | 'DAYS_1_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'OVER_90';
  label: string;
  invoiceCount: number;
  outstandingPesewas: number;
  corporateCount: number;
  corporateOutstandingPesewas: number;
  rentalCount: number;
  rentalOutstandingPesewas: number;
};

const AGEING_BUCKET_DEFS: Array<{ bucket: InvoiceAgeingBucket['bucket']; label: string; maxDays: number }> = [
  { bucket: 'CURRENT', label: 'Not yet due', maxDays: 0 },
  { bucket: 'DAYS_1_30', label: '1–30 days overdue', maxDays: 30 },
  { bucket: 'DAYS_31_60', label: '31–60 days overdue', maxDays: 60 },
  { bucket: 'DAYS_61_90', label: '61–90 days overdue', maxDays: 90 },
  { bucket: 'OVER_90', label: 'Over 90 days overdue', maxDays: Number.POSITIVE_INFINITY },
];

/**
 * D-090/5C invoice ageing, computed from ISSUED invoices only (callers
 * filter): bucketed by whole days between the recorded due date and the
 * as-of date. Invoices without a recorded due date are never folded into
 * the buckets; they are counted separately as undated. Zero-outstanding
 * rows do not age (they are settled), but undated invoices are counted
 * regardless so the gap stays visible.
 */
export function summariseInvoiceAgeing(rows: InvoiceAgeingInput[], asOfDate: string) {
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`).getTime();
  const buckets: InvoiceAgeingBucket[] = AGEING_BUCKET_DEFS.map((def) => ({
    bucket: def.bucket,
    label: def.label,
    invoiceCount: 0,
    outstandingPesewas: 0,
    corporateCount: 0,
    corporateOutstandingPesewas: 0,
    rentalCount: 0,
    rentalOutstandingPesewas: 0,
  }));
  const undated = { invoiceCount: 0, outstandingPesewas: 0 };
  for (const row of rows) {
    if (row.dueDate === null) {
      undated.invoiceCount += 1;
      undated.outstandingPesewas += row.outstandingPesewas;
      continue;
    }
    if (row.outstandingPesewas <= 0) continue;
    const daysOverdue = Math.floor((asOf - new Date(`${row.dueDate}T00:00:00.000Z`).getTime()) / 86_400_000);
    const def = AGEING_BUCKET_DEFS.find((candidate) => daysOverdue <= candidate.maxDays) ?? AGEING_BUCKET_DEFS[AGEING_BUCKET_DEFS.length - 1];
    const bucket = buckets.find((candidate) => candidate.bucket === def.bucket) as InvoiceAgeingBucket;
    bucket.invoiceCount += 1;
    bucket.outstandingPesewas += row.outstandingPesewas;
    if (row.kind === 'CORPORATE') {
      bucket.corporateCount += 1;
      bucket.corporateOutstandingPesewas += row.outstandingPesewas;
    } else {
      bucket.rentalCount += 1;
      bucket.rentalOutstandingPesewas += row.outstandingPesewas;
    }
  }
  return { asOfDate, buckets, undated };
}
