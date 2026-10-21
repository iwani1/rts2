import { describe, expect, it } from 'vitest';
import { summariseFinanceDashboard } from './dashboard-summary';

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
