import { describe, expect, it } from 'vitest';
import { matchReconciliation } from './reconciliation-matcher';

describe('reconciliation matcher (FIN-08 / D-085)', () => {
  it('reconciles when applied provider events match recorded payments', () => {
    const result = matchReconciliation({
      providerMethodLabel: 'Paystack',
      providerEvents: [
        { id: 'e1', providerReference: 'psk_1', amountPesewas: 15000, status: 'APPLIED', appliedPaymentId: 'p1' },
      ],
      payments: [
        { id: 'p1', method: 'Paystack', reference: 'psk_1', amountPesewas: 15000 },
        { id: 'p2', method: 'Bank transfer', reference: 'BANK-9', amountPesewas: 7000 },
      ],
    });
    expect(result.reconciles).toBe(true);
    expect(result.providerAppliedPesewas).toBe(15000);
    expect(result.recordedPaymentsPesewas).toBe(22000);
  });

  it('flags unapplied provider money, amount mismatches and unknown provider payments', () => {
    const result = matchReconciliation({
      providerMethodLabel: 'Paystack',
      providerEvents: [
        { id: 'e1', providerReference: 'psk_wait', amountPesewas: 9000, status: 'RECEIVED', appliedPaymentId: null },
        { id: 'e2', providerReference: 'psk_bad', amountPesewas: 5000, status: 'APPLIED', appliedPaymentId: 'p2' },
      ],
      payments: [
        { id: 'p1', method: 'Paystack', reference: 'psk_invented', amountPesewas: 3000 },
        { id: 'p2', method: 'Paystack', reference: 'psk_bad', amountPesewas: 4500 },
      ],
    });
    expect(result.reconciles).toBe(false);
    expect(result.discrepancies.unappliedProviderEvents).toHaveLength(1);
    expect(result.discrepancies.amountMismatches).toEqual([
      { eventId: 'e2', providerReference: 'psk_bad', eventPesewas: 5000, paymentPesewas: 4500 },
    ]);
    expect(result.discrepancies.unknownProviderPayments).toEqual([
      { paymentId: 'p1', reference: 'psk_invented', amountPesewas: 3000 },
    ]);
  });
});
