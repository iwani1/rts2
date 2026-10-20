import { describe, expect, it } from 'vitest';
import { customerInputSchema, customerRequestSchema } from './customer-schema';

const validCustomer = {
  reference: null,
  displayName: 'Example Customer',
  contactPerson: null,
  telephone: null,
  email: null,
  billingDetails: null,
  customerType: null,
  status: null,
  notes: null,
};

describe('customer schemas', () => {
  it('accepts a named customer with all undefined business terms left blank', () => {
    expect(customerInputSchema.parse(validCustomer)).toEqual(validCustomer);
  });

  it('accepts optional owner-entered reference, free-text type/status, and contact fields', () => {
    expect(customerInputSchema.parse({
      ...validCustomer,
      reference: 'Client ref 7',
      contactPerson: 'Ama Example',
      telephone: '+233 20 000 0000',
      email: 'ama@example.invalid',
      customerType: 'Organization',
      status: 'Active',
    })).toMatchObject({
      reference: 'Client ref 7',
      customerType: 'Organization',
      status: 'Active',
    });
  });

  it('rejects blank names, malformed email, unexpected fields and missing audit reason', () => {
    expect(customerInputSchema.safeParse({ ...validCustomer, displayName: ' ' }).success).toBe(false);
    expect(customerInputSchema.safeParse({ ...validCustomer, email: 'not-an-email' }).success).toBe(false);
    expect(customerInputSchema.safeParse({ ...validCustomer, secret: 'not allowed' }).success).toBe(false);
    expect(customerRequestSchema.safeParse(validCustomer).success).toBe(false);
  });
});
