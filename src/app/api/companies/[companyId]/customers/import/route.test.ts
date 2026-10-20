import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  importCustomersFromCsv: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  CustomerCompanyNotFoundError: class CustomerCompanyNotFoundError extends Error {},
  CustomerImportValidationError: class CustomerImportValidationError extends Error {
    constructor(readonly preview: unknown) { super('Fix every row before importing.'); }
  },
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/customers/customers', () => ({
  importCustomersFromCsv: mocks.importCustomersFromCsv,
  CustomerCompanyNotFoundError: mocks.CustomerCompanyNotFoundError,
  CustomerImportValidationError: mocks.CustomerImportValidationError,
}));

import { POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };
const makeRequest = (body: unknown) => new Request('http://localhost/api/companies/company-1/customers/import', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('customer import API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication before writing data', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(makeRequest({ csv: 'displayName\nCustomer', reason: 'Verified customer records' }), context);
    expect(response.status).toBe(401);
    expect(mocks.importCustomersFromCsv).not.toHaveBeenCalled();
  });

  it('uses the session actor, route company and no-store response', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
    mocks.importCustomersFromCsv.mockResolvedValue({ importedCount: 1, customers: [{ id: 'customer-1', displayName: 'Customer', reference: null }] });
    const body = { csv: 'displayName\nCustomer', reason: 'Verified customer records' };
    const response = await POST(makeRequest(body), context);
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.importCustomersFromCsv).toHaveBeenCalledWith({ ...body, actorId: 'manager-1', companyId: 'company-1' });
  });

  it('returns row-level validation results and does not report a partial write', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
    const preview = { totalRows: 2, validRows: 1, invalidRows: 1, canImport: false, fileErrors: [], rows: [] };
    mocks.importCustomersFromCsv.mockRejectedValue(new mocks.CustomerImportValidationError(preview));
    const response = await POST(makeRequest({ csv: 'displayName\nGood\n', reason: 'Verified customer records' }), context);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ preview, error: 'Fix every row before importing.' });
  });

  it('rejects malformed payloads before calling the service', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
    const response = await POST(makeRequest({ csv: 'displayName\nCustomer', reason: 'short' }), context);
    expect(response.status).toBe(400);
    expect(mocks.importCustomersFromCsv).not.toHaveBeenCalled();
  });
});
