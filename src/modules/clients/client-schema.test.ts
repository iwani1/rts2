import { describe, expect, it } from 'vitest';
import { clientInputSchema, clientRequestSchema } from './client-schema';

const validClient = {
  name: null as string | null,
  registrationDetails: null,
  contactPerson: null,
  telephone: null,
  email: null,
  billingAddress: null,
  status: null,
  notes: null,
};

describe('client schemas', () => {
  it('accepts a named client with all undefined business terms left blank', () => {
    expect(clientInputSchema.parse({ ...validClient, name: 'Example Client' })).toEqual({
      ...validClient,
      name: 'Example Client',
    });
  });

  it('accepts optional owner-entered registration, contact, contact, and free-text status', () => {
    expect(clientInputSchema.parse({
      ...validClient,
      name: 'Acme Limited',
      registrationDetails: 'RC-123456',
      contactPerson: 'Kofi Example',
      telephone: '+233 20 000 0000',
      email: 'kofi@example.invalid',
      billingAddress: 'Plot 7, Accra',
      status: 'Active',
      notes: 'Preferred corporate client',
    })).toMatchObject({
      name: 'Acme Limited',
      registrationDetails: 'RC-123456',
      contactPerson: 'Kofi Example',
      status: 'Active',
    });
  });

  it('rejects blank names, malformed email, unexpected fields and missing audit reason', () => {
    expect(clientInputSchema.safeParse({ ...validClient, name: ' ' }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...validClient, name: 'Acme', email: 'not-an-email' }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...validClient, name: 'Acme', secret: 'not allowed' }).success).toBe(false);
    expect(clientRequestSchema.safeParse({ ...validClient, name: 'Acme' }).success).toBe(false);
  });
});
