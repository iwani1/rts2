import { describe, expect, it } from 'vitest';
import { contractInputSchema, contractRequestSchema, contractTransitionSchema } from './contract-schema';

describe('contract schemas', () => {
  it('requires only a client and an audit reason; every business field is optional with no default', () => {
    const parsed = contractRequestSchema.parse({
      clientId: 'client-1', serviceType: null, startDate: null, endDate: null, renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Contract terms entered from the signed agreement',
    });
    expect(parsed.clientId).toBe('client-1');
    expect(parsed.pricingModel).toBeNull();
    expect(parsed.billingFrequency).toBeNull();
  });

  it('rejects an end date before the start date and unknown fields', () => {
    expect(() => contractInputSchema.parse({
      clientId: 'client-1', serviceType: null, startDate: '2026-05-10', endDate: '2026-05-01', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
    })).toThrow();
    expect(() => contractRequestSchema.parse({
      clientId: 'client-1', serviceType: null, startDate: null, endDate: null, renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Contract terms entered from the signed agreement', attachmentUrl: 'https://example.invalid/file',
    })).toThrow();
  });

  it('requires a reason of at least eight characters for audited changes', () => {
    expect(() => contractRequestSchema.parse({
      clientId: 'client-1', serviceType: null, startDate: null, endDate: null, renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'short',
    })).toThrow();
  });

  it('accepts renewal dates only when the target status is Active', () => {
    expect(contractTransitionSchema.parse({
      toStatus: 'Active', reason: 'Renewal approved by operations', renewalEndDate: '2027-12-31',
    }).renewalEndDate).toBe('2027-12-31');
    expect(() => contractTransitionSchema.parse({
      toStatus: 'Suspended', reason: 'Client asked to pause services', renewalEndDate: '2027-12-31',
    })).toThrow();
    expect(() => contractTransitionSchema.parse({
      toStatus: 'Active', reason: 'Renewal approved by operations',
      renewalStartDate: '2027-06-01', renewalEndDate: '2027-01-01',
    })).toThrow();
  });
});
