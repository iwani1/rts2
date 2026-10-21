import { describe, expect, it } from 'vitest';
import {
  RentalConflictError,
  RentalLifecyclePolicyError,
  confirmRentalSchema,
  outstandingFor,
  rentalLifecycleErrorStatus,
  submitCompletionSchema,
} from './rental-lifecycle';

describe('rental lifecycle pure logic (D-089)', () => {
  it('computes outstanding as quoted subtotal plus approved charges minus deposit', () => {
    expect(outstandingFor({
      quotedSubtotalPesewas: BigInt(9000), additionalChargesPesewas: 1500,
      depositReceivedPesewas: 5000, decisionChargesPesewas: null, status: 'SUBMITTED',
    })).toBe(5500);
    expect(outstandingFor({
      quotedSubtotalPesewas: BigInt(9000), additionalChargesPesewas: 1500,
      depositReceivedPesewas: 5000, decisionChargesPesewas: 1000, status: 'APPROVED',
    })).toBe(5000);
    expect(outstandingFor({
      quotedSubtotalPesewas: BigInt(9000), additionalChargesPesewas: 0,
      depositReceivedPesewas: 9000, decisionChargesPesewas: 0, status: 'APPROVED',
    })).toBe(0);
  });

  it('validates confirmation input', () => {
    expect(() => confirmRentalSchema.parse({
      vehicleId: 'v1', acceptedByName: 'A', acceptanceAt: '2027-01-10',
      acceptanceReference: 'ok', reason: 'short',
    })).toThrow();
    expect(confirmRentalSchema.parse({
      vehicleId: 'v1', acceptedByName: 'Ama Serwaa', acceptanceAt: '2027-01-10',
      acceptanceReference: 'Email ref', reason: 'Customer accepted the quotation',
    }).acceptedByName).toBe('Ama Serwaa');
  });

  it('requires charge description data to flow through validation bounds', () => {
    expect(() => submitCompletionSchema.parse({
      actualDepartureAt: '2027-01-15T08:05:00.000Z', actualReturnAt: '2027-01-15T09:40:00.000Z',
      vehicleReturnedAt: '2027-01-15T09:45:00.000Z', depositReceivedPesewas: -1,
      additionalChargesPesewas: 0,
    })).toThrow();
  });

  it('maps errors to HTTP statuses', () => {
    expect(rentalLifecycleErrorStatus(new RentalConflictError())).toBe(409);
    expect(rentalLifecycleErrorStatus(new RentalLifecyclePolicyError('X', 'policy'))).toBe(422);
    expect(rentalLifecycleErrorStatus(new Error('boom'))).toBe(500);
  });
});
