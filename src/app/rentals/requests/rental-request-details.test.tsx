// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RentalRequestRecord } from '@/modules/rentals/rental-requests';
import { RentalRequestDetails } from './rental-request-details';

const request = {
  id: 'request-1', customerId: 'customer-1', customerName: 'Accra Events Ltd', customerArchived: false,
  serviceDate: '2026-11-01', departureTime: '22:30', returnTime: '01:30', returnDate: '2026-11-02', durationMinutes: null,
  pickupLocation: 'Accra', destination: 'Kumasi', intermediateStops: null, passengerCount: 12,
  luggageSpecialNeeds: null, purpose: 'Staff event', requestedVehicleType: 'Coach', driverRequirement: null,
  tripContactName: 'Ama', tripContactTelephone: '+233 20 000 0000', tripContactEmail: null,
  notes: null, requestSource: 'PHONE', status: 'Submitted', createdAt: new Date(), updatedAt: new Date(),
} as RentalRequestRecord;

describe('RentalRequestDetails', () => {
  it('shows exact saved details, including the explicit overnight return date and missing values', () => {
    render(<RentalRequestDetails request={request} />);
    expect(screen.getByRole('heading', { name: 'Request details' })).toBeTruthy();
    expect(screen.getByText('2026-11-02')).toBeTruthy();
    expect(screen.getByText('22:30')).toBeTruthy();
    expect(screen.getByText('01:30')).toBeTruthy();
    expect(screen.getByText('Accra Events Ltd')).toBeTruthy();
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
    expect(screen.getByText(/no date or return time is inferred/i)).toBeTruthy();
  });
});
