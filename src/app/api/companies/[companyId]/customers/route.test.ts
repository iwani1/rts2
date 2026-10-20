import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  CustomerCompanyNotFoundError: class CustomerCompanyNotFoundError extends Error {},
  InvalidCustomerCursorError: class InvalidCustomerCursorError extends Error {},
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/customers/customers', () => ({
  listCustomers: mocks.listCustomers,
  createCustomer: mocks.createCustomer,
  CustomerCompanyNotFoundError: mocks.CustomerCompanyNotFoundError,
  InvalidCustomerCursorError: mocks.InvalidCustomerCursorError,
  isUniqueCustomerReferenceError: (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002',
}));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };

describe('company customer collection API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires an authenticated session before returning customer data', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/companies/company-1/customers'), context);
    expect(response.status).toBe(401);
    expect(mocks.listCustomers).not.toHaveBeenCalled();
  });

  it('uses the session actor and route tenant for the authorized search', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.listCustomers.mockResolvedValue({ customers: [], nextCursor: null, canManage: true });
    const response = await GET(new Request('http://localhost/api/companies/company-1/customers?search=Acme'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.listCustomers).toHaveBeenCalledWith({ actorId: 'user-1', companyId: 'company-1', search: 'Acme', cursor: undefined });
  });

  it('creates a customer with the session-derived actor and returns duplicate-reference conflicts', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.createCustomer.mockResolvedValueOnce({ id: 'customer-1' }).mockRejectedValueOnce({ code: 'P2002' });
    const body = { displayName: 'Example Customer', reason: 'Entered after enquiry' };
    const makeRequest = () => new Request('http://localhost/api/companies/company-1/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const created = await POST(makeRequest(), context);
    expect(created.status).toBe(201);
    expect(mocks.createCustomer).toHaveBeenCalledWith(body, 'user-1', 'company-1');
    const conflict = await POST(makeRequest(), context);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'That customer reference is already in use for this company.' });
  });
});
