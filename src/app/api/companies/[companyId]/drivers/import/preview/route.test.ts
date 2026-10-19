import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), previewDriverImport: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  DriverCompanyNotFoundError: class DriverCompanyNotFoundError extends Error {},
}));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/fleet/drivers', () => ({
  previewDriverImport: mocks.previewDriverImport, DriverCompanyNotFoundError: mocks.DriverCompanyNotFoundError,
}));

import { POST } from './route';
const context = { params: Promise.resolve({ companyId: 'company-1' }) };
const makeRequest = (body: unknown) => new Request('http://localhost/api/companies/company-1/drivers/import/preview', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('driver import preview API', () => {
  beforeEach(() => vi.resetAllMocks());
  it('requires authentication before processing CSV data', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(makeRequest({ csv: 'fullName' }), context)).status).toBe(401);
    expect(mocks.previewDriverImport).not.toHaveBeenCalled();
  });
  it('uses the authenticated actor and route company and prevents caching', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    mocks.previewDriverImport.mockResolvedValue({ totalRows: 1, validRows: 1, invalidRows: 0, canImport: true, fileErrors: [], rows: [] });
    const csv = 'fullName,licenceClass,licenceExpiresAt,qualifications,availability,status\nExample Driver,,,,,';
    const response = await POST(makeRequest({ csv }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.previewDriverImport).toHaveBeenCalledWith({ csv, actorId: 'fleet-manager-1', companyId: 'company-1' });
  });
  it('rejects unsupported body properties', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    const response = await POST(makeRequest({ csv: 'fullName', companyId: 'spoofed' }), context);
    expect(response.status).toBe(400);
    expect(mocks.previewDriverImport).not.toHaveBeenCalled();
  });
});
