import { describe, expect, it } from 'vitest';
import { vehicleRequestSchema } from './vehicle-schema';

const validVehicle = {
  registrationNumber: ' gr 1234-25 ',
  make: 'Make',
  model: 'Model',
  category: 'Owner supplied category',
  seatCount: null,
  fuelType: null,
  ownershipType: null,
  odometerValue: null,
  odometerUnit: null,
  insuranceExpiresAt: null,
  roadworthinessExpiresAt: null,
  registrationExpiresAt: null,
  nextServiceAt: null,
  notes: null,
  reason: 'Record received from fleet inspection',
};

describe('vehicle register validation', () => {
  it('accepts missing factual details without creating policy defaults', () => {
    expect(vehicleRequestSchema.parse(validVehicle).seatCount).toBeNull();
    expect(vehicleRequestSchema.parse(validVehicle).category).toBe('Owner supplied category');
  });

  it('requires an odometer unit whenever a reading is supplied', () => {
    expect(vehicleRequestSchema.safeParse({ ...validVehicle, odometerValue: 120 }).success).toBe(false);
    expect(vehicleRequestSchema.safeParse({ ...validVehicle, odometerValue: 120, odometerUnit: 'KM' }).success).toBe(true);
  });

  it('rejects invalid dates, seat counts, and unapproved extra input', () => {
    expect(vehicleRequestSchema.safeParse({ ...validVehicle, insuranceExpiresAt: '2026-02-30' }).success).toBe(false);
    expect(vehicleRequestSchema.safeParse({ ...validVehicle, seatCount: 0 }).success).toBe(false);
    expect(vehicleRequestSchema.safeParse({ ...validVehicle, status: 'AVAILABLE' }).success).toBe(false);
  });
});
