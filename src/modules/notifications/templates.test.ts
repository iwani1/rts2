import { describe, expect, it } from 'vitest';
import {
  bookingAssignedNotification,
  bookingCreatedNotification,
  bookingStatusNotification,
  rentalStatusNotification,
} from './templates';

describe('notification templates (NTF-01 / D-068)', () => {
  const booking = { reference: 'BKG-7', journeyDate: '2028-03-02', bookingType: 'HOME_TO_OFFICE' };

  it('wording for a requested journey', () => {
    const content = bookingCreatedNotification(booking);
    expect(content.title).toContain('BKG-7');
    expect(content.body).toContain('2028-03-02');
    expect(content.body).toContain('home to office');
  });

  it('maps booking statuses onto passenger-friendly wording', () => {
    expect(bookingStatusNotification(booking, 'Accepted').title).toContain('confirmed');
    expect(bookingStatusNotification(booking, 'Rejected').body).toContain('could not confirm');
    expect(bookingStatusNotification(booking, 'Cancelled').title).toContain('cancelled');
    // Unknown states stay honest instead of inventing a friendly lie.
    expect(bookingStatusNotification(booking, 'Boarded').body).toContain('Boarded');
  });

  it('announces the assigned trip reference', () => {
    const content = bookingAssignedNotification(booking, 'TRP-3');
    expect(content.body).toContain('TRP-3');
  });

  it('words rental review outcomes for customers', () => {
    const request = { pickupLocation: 'Accra Mall', destination: 'Cape Coast', serviceDate: '2028-04-10' };
    expect(rentalStatusNotification(request, 'Under Review').body).toContain('Accra Mall to Cape Coast');
    expect(rentalStatusNotification(request, 'Declined').title).toContain('declined');
    expect(rentalStatusNotification({ pickupLocation: null, destination: null, serviceDate: null }, 'Under Review').body)
      .toContain('your pickup');
  });
});
