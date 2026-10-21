import { describe, expect, it } from 'vitest';
import { isAllowedRentalRequestTransition, rentalRequestTransitions } from './rental-request-transitions';

describe('rental request transition matrix', () => {
  it('contains exactly the ratified transitions (D-032 + D-089)', () => {
    expect(rentalRequestTransitions).toEqual([
      { from: 'Submitted', to: 'Under Review' },
      { from: 'Under Review', to: 'Declined' },
      { from: 'Under Review', to: 'Confirmed' },
      { from: 'Confirmed', to: 'Assigned' },
      { from: 'Confirmed', to: 'Completed' },
      { from: 'Assigned', to: 'Completed' },
      { from: 'Confirmed', to: 'Cancelled' },
      { from: 'Assigned', to: 'Cancelled' },
    ]);
  });

  it('allows the full chain and pre-trip cancellation', () => {
    expect(isAllowedRentalRequestTransition('Submitted', 'Under Review')).toBe(true);
    expect(isAllowedRentalRequestTransition('Under Review', 'Confirmed')).toBe(true);
    expect(isAllowedRentalRequestTransition('Confirmed', 'Assigned')).toBe(true);
    expect(isAllowedRentalRequestTransition('Assigned', 'Completed')).toBe(true);
    expect(isAllowedRentalRequestTransition('Confirmed', 'Completed')).toBe(true);
    expect(isAllowedRentalRequestTransition('Confirmed', 'Cancelled')).toBe(true);
    expect(isAllowedRentalRequestTransition('Assigned', 'Cancelled')).toBe(true);
  });

  it('rejects unapproved, reverse, and self transitions across the wider matrix', () => {
    const statuses = ['Draft', 'Submitted', 'Under Review', 'Declined', 'Cancelled', 'Confirmed', 'Assigned', 'Completed'];
    const allowed = new Set(rentalRequestTransitions.map((row) => `${row.from}->${row.to}`));
    for (const from of statuses) {
      for (const to of statuses) {
        expect(isAllowedRentalRequestTransition(from, to), `${from} -> ${to}`).toBe(allowed.has(`${from}->${to}`));
      }
    }
    expect(isAllowedRentalRequestTransition('Under Review', 'Awaiting Quotation')).toBe(false);
  });
});
