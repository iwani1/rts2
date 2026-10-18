import { describe, expect, it } from 'vitest';
import { driverRequestSchema } from './driver-schema';

const validDriver = {
  fullName: 'Verified Driver Name',
  licenceClass: null,
  licenceExpiresAt: null,
  qualifications: null,
  availability: null,
  status: null,
  reason: 'Driver record entry from verified documents',
};

describe('driver register validation', () => {
  it('accepts unknown driver facts as blank without supplying defaults', () => {
    const parsed = driverRequestSchema.parse(validDriver);
    expect(parsed.status).toBeNull();
    expect(parsed.availability).toBeNull();
    expect(parsed.licenceClass).toBeNull();
  });

  it('rejects invalid names, dates and extra unapproved personal-data fields', () => {
    expect(driverRequestSchema.safeParse({ ...validDriver, fullName: '   ' }).success).toBe(false);
    expect(driverRequestSchema.safeParse({ ...validDriver, licenceExpiresAt: '2026-02-30' }).success).toBe(false);
    expect(driverRequestSchema.safeParse({ ...validDriver, driverCode: 'invented' }).success).toBe(false);
    expect(driverRequestSchema.safeParse({ ...validDriver, phoneNumber: 'extra personal data' }).success).toBe(false);
  });
});
