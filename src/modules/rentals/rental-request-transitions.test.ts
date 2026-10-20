import { describe, expect, it } from 'vitest';
import { isAllowedRentalRequestTransition, rentalRequestTransitions } from './rental-request-transitions';

describe('approved rental request transition slice', () => {
  it('allows review to begin only from Submitted and decline only from Under Review', () => {
    expect(rentalRequestTransitions).toEqual([
      { from: 'Submitted', to: 'Under Review' },
      { from: 'Under Review', to: 'Declined' },
    ]);
    expect(isAllowedRentalRequestTransition('Submitted', 'Under Review')).toBe(true);
    expect(isAllowedRentalRequestTransition('Under Review', 'Declined')).toBe(true);
  });

  it('rejects unapproved, reverse, and resource-bearing transitions', () => {
    for (const [from, to] of [
      ['Draft', 'Under Review'], ['Submitted', 'Declined'], ['Submitted', 'Confirmed'], ['Under Review', 'Awaiting Quotation'],
      ['Under Review', 'Submitted'], ['Confirmed', 'Cancelled'], ['Under Review', 'Under Review'],
    ]) expect(isAllowedRentalRequestTransition(from, to)).toBe(false);
  });
});
