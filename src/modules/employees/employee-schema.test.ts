import { describe, expect, it } from 'vitest';
import { employeeRequestSchema } from './employee-schema';

const base = {
  clientId: 'client-1', reference: null, fullName: 'Ama Serwaa', telephone: null, email: null,
  homeAddress: null, department: null, workLocation: null, shift: null, approvedPickupLocation: null,
  approvedDropoffLocation: null, accountStatus: null, transportEligible: null, accessibilityNeeds: null,
  notes: null, reason: 'Employee record entered by HR',
};

describe('employee schema', () => {
  it('requires a client and a name; every other field is optional with no default', () => {
    const parsed = employeeRequestSchema.parse(base);
    expect(parsed.transportEligible).toBeNull();
    expect(parsed.accountStatus).toBeNull();
    expect(() => employeeRequestSchema.parse({ ...base, clientId: '' })).toThrow();
    expect(() => employeeRequestSchema.parse({ ...base, fullName: ' ' })).toThrow();
  });

  it('rejects unknown fields so restricted data cannot be smuggled under new names', () => {
    expect(() => employeeRequestSchema.parse({ ...base, salary: 5000 })).toThrow();
  });

  it('requires an audit reason of at least eight characters', () => {
    expect(() => employeeRequestSchema.parse({ ...base, reason: 'short' })).toThrow();
  });
});
