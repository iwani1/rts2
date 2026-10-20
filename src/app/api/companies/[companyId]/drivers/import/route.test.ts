import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), importDriversFromCsv: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  DriverCompanyNotFoundError: class DriverCompanyNotFoundError extends Error {},
  DriverImportValidationError: class DriverImportValidationError extends Error {
    constructor(readonly preview: unknown) { super('Fix every row before importing.'); }
  },
}));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/fleet/drivers', () => ({
  importDriversFromCsv: mocks.importDriversFromCsv,
  DriverCompanyNotFoundError: mocks.DriverCompanyNotFoundError,
  DriverImportValidationError: mocks.DriverImportValidationError,
}));

import { POST } from './route';
const context = { params: Promise.resolve({ companyId: 'company-1' }) };
const makeRequest = (body: unknown) => new Request('http://localhost/api/companies/company-1/drivers/import', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('driver import API', () => {
  beforeEach(() => vi.resetAllMocks());
  it('requires authentication before creating driver records', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(makeRequest({ csv: 'csv', reason: 'Verified roster data' }), context)).status).toBe(401);
    expect(mocks.importDriversFromCsv).not.toHaveBeenCalled();
  });
  it('uses authenticated actor and route company for atomic import', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    mocks.importDriversFromCsv.mockResolvedValue({ importedCount: 1, drivers: [{ id: 'driver-1', fullName: 'Example Driver' }] });
    const body = { csv: 'fullName,licenceClass,licenceExpiresAt,qualifications,availability,status\nExample Driver,,,,,', reason: 'Verified roster data' };
    const response = await POST(makeRequest(body), context);
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.importDriversFromCsv).toHaveBeenCalledWith({ ...body, actorId: 'fleet-manager-1', companyId: 'company-1' });
  });
  it('returns row validation and rejects malformed payloads', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    const preview = { totalRows: 1, validRows: 0, invalidRows: 1, canImport: false, fileErrors: [], rows: [] };
    mocks.importDriversFromCsv.mockRejectedValue(new mocks.DriverImportValidationError(preview));
    expect((await POST(makeRequest({ csv: 'bad', reason: 'Verified roster data' }), context)).status).toBe(422);
    expect((await POST(makeRequest({ csv: 'bad', reason: 'short' }), context)).status).toBe(400);
  });
});
