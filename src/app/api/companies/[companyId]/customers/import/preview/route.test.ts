import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  previewCustomerImport: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  CustomerCompanyNotFoundError: class CustomerCompanyNotFoundError extends Error {},
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/customers/customers', () => ({
  previewCustomerImport: mocks.previewCustomerImport,
  CustomerCompanyNotFoundError: mocks.CustomerCompanyNotFoundError,
}));

import { POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };
const makeRequest = (body: unknown) => new Request('http://localhost/api/companies/company-1/customers/import/preview', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('customer import preview API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(makeRequest({ csv: 'displayName\nCustomer' }), context);
    expect(response.status).toBe(401);
    expect(mocks.previewCustomerImport).not.toHaveBeenCalled();
  });

  it('uses the session actor and route company and never caches preview data', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
    mocks.previewCustomerImport.mockResolvedValue({ totalRows: 1, validRows: 1, invalidRows: 0, canImport: true, fileErrors: [], rows: [] });
    const response = await POST(makeRequest({ csv: 'displayName\nCustomer' }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.previewCustomerImport).toHaveBeenCalledWith({ csv: 'displayName\nCustomer', actorId: 'manager-1', companyId: 'company-1' });
  });

  it('rejects malformed payloads without calling the import service', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
    const response = await POST(makeRequest({ csv: 'displayName\nCustomer', unexpected: true }), context);
    expect(response.status).toBe(400);
    expect(mocks.previewCustomerImport).not.toHaveBeenCalled();
  });
});
