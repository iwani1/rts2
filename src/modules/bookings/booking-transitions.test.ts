import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUSES,
  allowedBookingTargets,
  bookingTransitions,
  isAllowedBookingTransition,
} from './booking-transitions';

describe('booking transition table (D-052)', () => {
  it('covers every ordered from-to pair in the full matrix', () => {
    const allowed = new Set(bookingTransitions.map(({ from, to }) => `${from} -> ${to}`));
    for (const from of BOOKING_STATUSES) {
      for (const to of BOOKING_STATUSES) {
        expect(isAllowedBookingTransition(from, to), `${from} -> ${to}`).toBe(allowed.has(`${from} -> ${to}`));
      }
    }
  });

  it('allows exactly the approved transitions', () => {
    expect(bookingTransitions.map(({ from, to }) => `${from} -> ${to}`).sort()).toEqual([
      'Accepted -> Assigned',
      'Accepted -> Cancelled',
      'Assigned -> Accepted',
      'Assigned -> Boarded',
      'Assigned -> Cancelled',
      'Boarded -> Completed',
      'Pending -> Accepted',
      'Pending -> Cancelled',
      'Pending -> Rejected',
    ].sort());
  });

  it('treats Rejected, Completed and Cancelled as terminal', () => {
    expect(allowedBookingTargets('Rejected')).toEqual([]);
    expect(allowedBookingTargets('Completed')).toEqual([]);
    expect(allowedBookingTargets('Cancelled')).toEqual([]);
  });
});
