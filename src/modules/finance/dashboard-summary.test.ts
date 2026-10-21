import { describe, expect, it } from 'vitest';
import { summariseCostsAndMargin, summariseFinanceDashboard } from './dashboard-summary';

const statuses = [
  { status: 'DRAFT', invoiceCount: 1, totalPesewas: 20000 },
  { status: 'ISSUED', invoiceCount: 2, totalPesewas: 40000 },
  { status: 'PAID', invoiceCount: 1, totalPesewas: 20000 },
  { status: 'VOID', invoiceCount: 1, totalPesewas: 20000 },
];

describe('summariseFinanceDashboard (FIN-07 / D-063)', () => {
  it('recognises revenue from issued and paid invoices only, with drafts as pipeline', () => {
    const summary = summariseFinanceDashboard({
      statusTotals: statuses, totalPaymentsPesewas: 25000, outstandingPesewas: 35000, clients: [],
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
      statusTotals: statuses, totalPaymentsPesewas: 25000, outstandingPesewas: 35000, clients: [],
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
      statusTotals: statuses, totalPaymentsPesewas: 20000, outstandingPesewas: 35000, clients: [],
    });
    expect(summary.reconciliation.reconciles).toBe(false);
  });

  it('derives per-client outstanding and sorts by largest balance, then name', () => {
    const summary = summariseFinanceDashboard({
      statusTotals: statuses, totalPaymentsPesewas: 25000, outstandingPesewas: 35000,
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
      statusTotals: [], totalPaymentsPesewas: 0, outstandingPesewas: 0, clients: [],
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
