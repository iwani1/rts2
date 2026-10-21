import { describe, expect, it } from 'vitest';
import {
  allowedRentalInvoiceTargets,
  isAllowedRentalInvoiceTransition,
  rentalInvoiceTransitions,
} from './rental-invoice-transitions';

describe('rental invoice transition matrix (D-090/5A)', () => {
  it('contains exactly the governed transitions', () => {
    expect(rentalInvoiceTransitions).toEqual([
      { from: 'DRAFT', to: 'ISSUED' },
      { from: 'DRAFT', to: 'VOID' },
      { from: 'ISSUED', to: 'PAID' },
      { from: 'ISSUED', to: 'VOID' },
    ]);
  });

  it('rejects every other from-to pair in the wider matrix', () => {
    const statuses = ['DRAFT', 'ISSUED', 'PAID', 'VOID'];
    const allowed = new Set(rentalInvoiceTransitions.map((row) => `${row.from}->${row.to}`));
    for (const from of statuses) {
      for (const to of statuses) {
        expect(isAllowedRentalInvoiceTransition(from, to), `${from} -> ${to}`).toBe(allowed.has(`${from}->${to}`));
      }
      expect(allowedRentalInvoiceTargets(from)).toEqual(
        rentalInvoiceTransitions.filter((row) => row.from === from).map((row) => row.to),
      );
    }
  });
});
