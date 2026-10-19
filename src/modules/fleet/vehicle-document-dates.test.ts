import { describe, expect, it } from 'vitest';
import { getVehicleDocumentDates } from './vehicle-document-dates';

const vehicle = (overrides: Partial<Parameters<typeof getVehicleDocumentDates>[0][number]> = {}) => ({
  id: 'vehicle-1',
  registrationNumber: 'GR 1234-25',
  make: 'Toyota',
  model: 'Hiace',
  insuranceExpiresAt: null,
  roadworthinessExpiresAt: null,
  registrationExpiresAt: null,
  ...overrides,
});

describe('vehicle document expiry date projection', () => {
  it('lists only recorded approved document dates, ordered by date', () => {
    const dates = getVehicleDocumentDates([
      vehicle({
        id: 'vehicle-1', insuranceExpiresAt: '2027-07-01', roadworthinessExpiresAt: null,
        registrationExpiresAt: '2027-01-15',
      }),
      vehicle({
        id: 'vehicle-2', registrationNumber: 'GR 2222-25', roadworthinessExpiresAt: '2026-12-30',
      }),
    ]);

    expect(dates).toEqual([
      expect.objectContaining({ vehicleId: 'vehicle-2', documentType: 'Roadworthiness', expiryDate: '2026-12-30' }),
      expect.objectContaining({ vehicleId: 'vehicle-1', documentType: 'Vehicle Registration', expiryDate: '2027-01-15' }),
      expect.objectContaining({ vehicleId: 'vehicle-1', documentType: 'Insurance', expiryDate: '2027-07-01' }),
    ]);
  });

  it('filters to a selected approved document type without changing its recorded date', () => {
    const dates = getVehicleDocumentDates([
      vehicle({ insuranceExpiresAt: '2027-07-01', roadworthinessExpiresAt: '2026-12-30' }),
    ], 'Roadworthiness');

    expect(dates).toEqual([
      expect.objectContaining({ documentType: 'Roadworthiness', expiryDate: '2026-12-30' }),
    ]);
  });

  it('returns no document rows when no expiry date has been entered', () => {
    expect(getVehicleDocumentDates([vehicle()])).toEqual([]);
  });
});
