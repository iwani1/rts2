import { describe, expect, it } from 'vitest';
import { missingRentalRequestSubmissionFields, rentalRequestDraftSchema, rentalRequestTimeSubmissionSchema } from './rental-request-schema';

const partialDraft = {
  customerId: 'customer-1',
  serviceDate: null,
  departureTime: null,
  returnTime: null,
  returnDate: null,
  durationMinutes: null,
  pickupLocation: null,
  destination: null,
  intermediateStops: null,
  passengerCount: null,
  luggageSpecialNeeds: null,
  purpose: null,
  requestedVehicleType: null,
  driverRequirement: null,
  tripContactName: null,
  tripContactTelephone: null,
  tripContactEmail: null,
  notes: null,
  requestSource: null,
  reason: 'Record enquiry for later completion',
};

describe('rental request draft schemas', () => {
  it('accepts incomplete drafts without applying values or defaults', () => {
    expect(rentalRequestDraftSchema.parse(partialDraft)).toEqual(partialDraft);
    const preReturnDatePayload = Object.fromEntries(Object.entries(partialDraft).filter(([key]) => key !== 'returnDate'));
    expect(rentalRequestDraftSchema.safeParse(preReturnDatePayload).success).toBe(true);
  });

  it('validates calendar dates, times, source, positive counts and contact email', () => {
    expect(rentalRequestDraftSchema.safeParse({ ...partialDraft, serviceDate: '2026-02-30' }).success).toBe(false);
    expect(rentalRequestDraftSchema.safeParse({ ...partialDraft, returnDate: '2026-11-31' }).success).toBe(false);
    expect(rentalRequestDraftSchema.safeParse({ ...partialDraft, returnDate: '2026-11-02' }).success).toBe(true);
    expect(rentalRequestDraftSchema.safeParse({ ...partialDraft, departureTime: '25:00' }).success).toBe(false);
    expect(rentalRequestDraftSchema.safeParse({ ...partialDraft, requestSource: 'SMS' }).success).toBe(false);
    expect(rentalRequestDraftSchema.safeParse({ ...partialDraft, passengerCount: 0 }).success).toBe(false);
    expect(rentalRequestDraftSchema.safeParse({ ...partialDraft, durationMinutes: 90.5 }).success).toBe(false);
    expect(rentalRequestDraftSchema.safeParse({ ...partialDraft, tripContactEmail: 'bad' }).success).toBe(false);
    expect(rentalRequestDraftSchema.safeParse({ ...partialDraft, driverId: 'vehicle-1' }).success).toBe(false);
  });

  it('reports each approved D-023 submission requirement and accepts either time alternative', () => {
    const incomplete = {
      serviceDate: null,
      departureTime: null,
      returnTime: null,
      returnDate: null,
      durationMinutes: null,
      pickupLocation: null,
      destination: null,
      passengerCount: null,
      requestSource: null,
    };
    expect(missingRentalRequestSubmissionFields(incomplete)).toEqual([
      'service date', 'departure time', 'pickup location', 'destination', 'passenger count', 'request source', 'return time or duration',
    ]);
    expect(missingRentalRequestSubmissionFields({
      ...incomplete,
      serviceDate: new Date('2026-10-30T00:00:00.000Z'),
      departureTime: '08:30',
      returnTime: '17:00',
      returnDate: null,
      pickupLocation: 'Accra',
      destination: 'Kumasi',
      passengerCount: 12,
      requestSource: 'PHONE',
    })).toEqual([]);
    expect(missingRentalRequestSubmissionFields({
      ...incomplete,
      serviceDate: new Date('2026-10-30T00:00:00.000Z'),
      departureTime: '08:30',
      durationMinutes: 90,
      returnDate: null,
      pickupLocation: 'Accra',
      destination: 'Kumasi',
      passengerCount: 12,
      requestSource: 'PHONE',
    })).toEqual([]);
  });

  it('requires an explicit later return date for an overnight return time', () => {
    const overnight = {
      serviceDate: new Date('2026-10-30T00:00:00.000Z'),
      departureTime: '22:00',
      returnTime: '01:00',
      returnDate: null,
      durationMinutes: null,
      pickupLocation: 'Accra',
      destination: 'Kumasi',
      passengerCount: 12,
      requestSource: 'PHONE',
    };
    expect(missingRentalRequestSubmissionFields(overnight)).toContain('return date for overnight trip');
    expect(missingRentalRequestSubmissionFields({
      ...overnight,
      returnDate: new Date('2026-10-31T00:00:00.000Z'),
    })).toEqual([]);
    expect(missingRentalRequestSubmissionFields({
      ...overnight,
      returnDate: new Date('2026-10-30T00:00:00.000Z'),
    })).toContain('return date after service date for overnight trip');
  });

  it('applies the approved return-time-or-duration rule only when preparing submission', () => {
    expect(rentalRequestTimeSubmissionSchema.safeParse({ returnTime: null, durationMinutes: null }).success).toBe(false);
    expect(rentalRequestTimeSubmissionSchema.safeParse({ returnTime: '17:00', durationMinutes: null }).success).toBe(true);
    expect(rentalRequestTimeSubmissionSchema.safeParse({ returnTime: null, durationMinutes: 90 }).success).toBe(true);
  });
});
