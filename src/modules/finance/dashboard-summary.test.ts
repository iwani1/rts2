import { describe, expect, it } from 'vitest';
import { summariseCostsAndMargin, summariseFinanceDashboard, summariseInvoiceAgeing, summariseRevenueStream } from './dashboard-summary';

const emptyStream = { statusTotals: [], totalPaymentsPesewas: 0, outstandingPesewas: 0 };

const statuses = [
  { status: 'DRAFT', invoiceCount: 1, totalPesewas: 20000 },
  { status: 'ISSUED', invoiceCount: 2, totalPesewas: 40000 },
  { status: 'PAID', invoiceCount: 1, totalPesewas: 20000 },
  { status: 'VOID', invoiceCount: 1, totalPesewas: 20000 },
];

describe('summariseFinanceDashboard (FIN-07 / D-063)', () => {
  it('recognises revenue from issued and paid invoices only, with drafts as pipeline', () => {
    const summary = summariseFinanceDashboard({
      corporate: { statusTotals: statuses, totalPaymentsPesewas: 25000, outstandingPesewas: 35000 },
      rental: emptyStream, statusTotals: statuses, clients: [],
    });
    expect(summary.recognizedRevenuePesewas).toBe(60000);
    expect(summary.draftPipelinePesewas).toBe(20000);
    expect(summary.draftInvoiceCount).toBe(1);
    expect(summary.voidedInvoiceCount).toBe(1);
    expect(summary.voidedTotalPesewas).toBe(20000);
    expect(summary.countsByStatus).toEqual([
      { status: 'DRAFT', invoiceCount: 1, totalPesewas: 20000 },
      { status: 'ISSUED', invoiceCount: 2, totalPesewas: 40000 },
      { status: 'PAID', invoiceCount: 1, totalPesewas: 20000 },
      { status: 'VOID', invoiceCount: 1, totalPesewas: 20000 },
    ]);
  });

  it('proves the reconciliation identity revenue = payments + outstanding', () => {
    const summary = summariseFinanceDashboard({
      corporate: { statusTotals: statuses, totalPaymentsPesewas: 25000, outstandingPesewas: 35000 },
      rental: emptyStream, statusTotals: statuses, clients: [],
    });
    expect(summary.reconciliation).toEqual({
      recognizedRevenuePesewas: 60000,
      paymentsReceivedPesewas: 25000,
      outstandingPesewas: 35000,
      reconciles: true,
    });
  });

  it('flags a broken tie-out instead of hiding it', () => {
    const summary = summariseFinanceDashboard({
      corporate: { statusTotals: statuses, totalPaymentsPesewas: 20000, outstandingPesewas: 35000 },
      rental: emptyStream, statusTotals: statuses, clients: [],
    });
    expect(summary.reconciliation.reconciles).toBe(false);
  });

  it('derives per-client outstanding and sorts by largest balance, then name', () => {
    const summary = summariseFinanceDashboard({
      corporate: { statusTotals: statuses, totalPaymentsPesewas: 25000, outstandingPesewas: 35000 },
      rental: emptyStream, statusTotals: statuses,
      clients: [
        { clientId: 'c1', clientName: 'Beta Ltd', standingInvoiceCount: 2, invoicedPesewas: 40000, paidPesewas: 25000 },
        { clientId: 'c2', clientName: 'alpha Ltd', standingInvoiceCount: 1, invoicedPesewas: 20000, paidPesewas: 5000 },
        { clientId: 'c3', clientName: 'Gamma Ltd', standingInvoiceCount: 1, invoicedPesewas: 20000, paidPesewas: 20000 },
      ],
    });
    expect(summary.clients.map((client) => client.clientId)).toEqual(['c2', 'c1', 'c3']);
    expect(summary.clients[0].outstandingPesewas).toBe(15000);
    expect(summary.clients[1].outstandingPesewas).toBe(15000);
    expect(summary.clients[2].outstandingPesewas).toBe(0);
  });

  it('treats an empty ledger as reconciled zeros', () => {
    const summary = summariseFinanceDashboard({
      corporate: emptyStream, rental: emptyStream, statusTotals: [], clients: [],
    });
    expect(summary.recognizedRevenuePesewas).toBe(0);
    expect(summary.countsByStatus).toEqual([
      { status: 'DRAFT', invoiceCount: 0, totalPesewas: 0 },
      { status: 'ISSUED', invoiceCount: 0, totalPesewas: 0 },
      { status: 'PAID', invoiceCount: 0, totalPesewas: 0 },
      { status: 'VOID', invoiceCount: 0, totalPesewas: 0 },
    ]);
    expect(summary.reconciliation.reconciles).toBe(true);
    expect(summary.clients).toEqual([]);
  });
});

describe('approved-expense costs and estimated margin (FIN-05R / D-082)', () => {
  const categoryRows = [
    { category: 'FUEL', expenseCount: 2, amountPesewas: 90000 },
    { category: 'TOLLS', expenseCount: 1, amountPesewas: 4500 },
  ];

  it('sums approved categories and estimates margin on a matched basis', () => {
    const result = summariseCostsAndMargin({
      approvedByCategory: categoryRows, pendingCount: 1, pendingPesewas: 700,
      tripCosts: [], revenuePesewas: 200000, basis: 'all-time',
    });
    expect(result.approvedExpensesPesewas).toBe(94500);
    expect(result.approvedExpenseCount).toBe(3);
    expect(result.margin).toEqual({
      status: 'ESTIMATED', basis: 'all-time', revenuePesewas: 200000,
      approvedCostsPesewas: 94500, marginPesewas: 105500,
    });
  });

  it('stays insufficient-data without approved costs or without revenue', () => {
    expect(summariseCostsAndMargin({
      approvedByCategory: [], pendingCount: 0, pendingPesewas: 0,
      tripCosts: [], revenuePesewas: 200000, basis: 'window',
    }).margin.status).toBe('INSUFFICIENT_DATA');
    expect(summariseCostsAndMargin({
      approvedByCategory: categoryRows, pendingCount: 0, pendingPesewas: 0,
      tripCosts: [], revenuePesewas: 0, basis: 'all-time',
    }).margin.status).toBe('INSUFFICIENT_DATA');
  });

  it('derives cost per passenger only from completed journeys', () => {
    const result = summariseCostsAndMargin({
      approvedByCategory: categoryRows, pendingCount: 0, pendingPesewas: 0,
      tripCosts: [
        { tripId: 't1', tripDate: '2026-10-01', approvedCostPesewas: 10000, completedJourneys: 4 },
        { tripId: 't2', tripDate: '2026-10-02', approvedCostPesewas: 10000, completedJourneys: 0 },
      ],
      revenuePesewas: 50000, basis: 'window',
    });
    expect(result.tripCosts[0].costPerPassengerPesewas).toBe(2500);
    expect(result.tripCosts[1].costPerPassengerPesewas).toBeNull();
  });
});

describe('summariseInvoiceAgeing (D-090/5C)', () => {
  it('buckets by whole days overdue with corporate/rental splits and an undated lane', () => {
    const result = summariseInvoiceAgeing([
      { kind: 'CORPORATE', dueDate: '2026-10-21', outstandingPesewas: 100 }, // due today -> CURRENT
      { kind: 'RENTAL', dueDate: '2026-11-05', outstandingPesewas: 200 }, // future -> CURRENT
      { kind: 'CORPORATE', dueDate: '2026-10-20', outstandingPesewas: 300 }, // 1 day
      { kind: 'CORPORATE', dueDate: '2026-09-21', outstandingPesewas: 400 }, // 30 days
      { kind: 'RENTAL', dueDate: '2026-09-20', outstandingPesewas: 500 }, // 31 days
      { kind: 'CORPORATE', dueDate: '2026-08-21', outstandingPesewas: 600 }, // 61 days
      { kind: 'CORPORATE', dueDate: '2026-07-22', outstandingPesewas: 700 }, // 91 days
      { kind: 'RENTAL', dueDate: null, outstandingPesewas: 800 },
      { kind: 'CORPORATE', dueDate: '2026-01-01', outstandingPesewas: 0 }, // settled: never ages
    ], '2026-10-21');
    expect(result.asOfDate).toBe('2026-10-21');
    expect(result.buckets.map((b) => [b.bucket, b.invoiceCount, b.outstandingPesewas])).toEqual([
      ['CURRENT', 2, 300],
      ['DAYS_1_30', 2, 700],
      ['DAYS_31_60', 1, 500],
      ['DAYS_61_90', 1, 600],
      ['OVER_90', 1, 700],
    ]);
    const current = result.buckets[0];
    expect([current.corporateOutstandingPesewas, current.rentalOutstandingPesewas]).toEqual([100, 200]);
    expect(result.undated).toEqual({ invoiceCount: 1, outstandingPesewas: 800 });
  });
});

describe('rental revenue recognition (D-091 / Phase 6)', () => {
  const rentalStatuses = [
    { status: 'DRAFT', invoiceCount: 1, totalPesewas: 5000 },
    { status: 'ISSUED', invoiceCount: 1, totalPesewas: 12000 },
    { status: 'PAID', invoiceCount: 1, totalPesewas: 8000 },
    { status: 'VOID', invoiceCount: 1, totalPesewas: 3000 },
  ];

  it('recognises a rental stream on issue and reconciles it independently', () => {
    const rental = summariseRevenueStream({ statusTotals: rentalStatuses, totalPaymentsPesewas: 14000, outstandingPesewas: 6000 });
    expect(rental.recognizedRevenuePesewas).toBe(20000);
    expect(rental.outstandingPesewas).toBe(6000);
    expect(rental.draftPipelinePesewas).toBe(5000);
    expect(rental.voidedTotalPesewas).toBe(3000);
    expect(rental.reconciles).toBe(true);
  });

  it('combines streams with the identity holding per stream and combined', () => {
    const summary = summariseFinanceDashboard({
      corporate: { statusTotals: statuses, totalPaymentsPesewas: 25000, outstandingPesewas: 35000 },
      rental: { statusTotals: rentalStatuses, totalPaymentsPesewas: 14000, outstandingPesewas: 6000 },
      statusTotals: [...statuses, ...rentalStatuses],
      clients: [],
    });
    expect(summary.streams.corporate.recognizedRevenuePesewas).toBe(60000);
    expect(summary.streams.rental.recognizedRevenuePesewas).toBe(20000);
    expect(summary.recognizedRevenuePesewas).toBe(80000);
    expect(summary.paymentsReceivedPesewas).toBe(39000);
    expect(summary.outstandingPesewas).toBe(41000);
    expect(summary.reconciliation.reconciles).toBe(true);
    expect(summary.streams.rental.reconciles).toBe(true);
    // Combined status totals aggregate same-status rows across families.
    expect(summary.countsByStatus.find((row) => row.status === 'ISSUED')).toEqual({ status: 'ISSUED', invoiceCount: 3, totalPesewas: 52000 });
  });
});
