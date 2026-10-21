import { describe, expect, it } from 'vitest';
import {
  isAllowedRentalQuotationTransition,
  rentalQuotationTransitions,
} from './rental-quotation-transitions';
import { presentQuotation } from './rental-quotations';

describe('rental quotation transition matrix (D-090/5B)', () => {
  it('contains exactly the governed transitions', () => {
    expect(rentalQuotationTransitions).toEqual([
      { from: 'ISSUED', to: 'ACCEPTED' },
      { from: 'ISSUED', to: 'DECLINED' },
      { from: 'ISSUED', to: 'SUPERSEDED' },
    ]);
  });

  it('rejects every other pair in the wider matrix', () => {
    const statuses = ['ISSUED', 'ACCEPTED', 'DECLINED', 'SUPERSEDED'];
    const allowed = new Set(rentalQuotationTransitions.map((row) => `${row.from}->${row.to}`));
    for (const from of statuses) {
      for (const to of statuses) {
        expect(isAllowedRentalQuotationTransition(from, to), `${from} -> ${to}`).toBe(allowed.has(`${from}->${to}`));
      }
    }
  });

  it('derives EXPIRED in presentation only for a live quote past its expiry', () => {
    const base = {
      id: 'q1', reference: 'QUO-ABC', requestId: 'r1', worksheetVersion: 2, status: 'ISSUED',
      subtotalPesewas: BigInt(9000), taxPesewas: BigInt(900), totalPesewas: BigInt(9900),
      taxSnapshot: [], expiresAt: new Date('2027-01-20T00:00:00.000Z'),
      decidedAt: null, decisionReason: null, createdAt: new Date('2027-01-10T00:00:00.000Z'),
    };
    expect(presentQuotation(base, new Date('2027-01-19T00:00:00.000Z')).displayStatus).toBe('ISSUED');
    expect(presentQuotation(base, new Date('2027-01-21T00:00:00.000Z')).displayStatus).toBe('EXPIRED');
    expect(presentQuotation({ ...base, status: 'ACCEPTED' }, new Date('2027-01-21T00:00:00.000Z')).displayStatus).toBe('ACCEPTED');
    expect(presentQuotation(base).totalPesewas).toBe(9900);
  });
});
