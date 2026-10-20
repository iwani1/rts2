import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  previewVehicleImport: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  FleetCompanyNotFoundError: class FleetCompanyNotFoundError extends Error {},
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/fleet/vehicles', () => ({
  previewVehicleImport: mocks.previewVehicleImport,
  FleetCompanyNotFoundError: mocks.FleetCompanyNotFoundError,
}));

import { POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };
const makeRequest = (body: unknown) => new Request('http://localhost/api/companies/company-1/vehicles/import/preview', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('vehicle import preview API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication before processing CSV data', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(makeRequest({ csv: 'registrationNumber,make,model,category' }), context);
    expect(response.status).toBe(401);
    expect(mocks.previewVehicleImport).not.toHaveBeenCalled();
  });

  it('uses the session actor and route company and does not cache preview data', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    mocks.previewVehicleImport.mockResolvedValue({ totalRows: 1, validRows: 1, invalidRows: 0, canImport: true, fileErrors: [], rows: [] });
    const csv = 'registrationNumber,make,model,category\nGR-1,Toyota,Coaster,Bus';
    const response = await POST(makeRequest({ csv }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.previewVehicleImport).toHaveBeenCalledWith({ csv, actorId: 'fleet-manager-1', companyId: 'company-1' });
  });

  it('rejects unsupported payload properties', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    const response = await POST(makeRequest({ csv: 'registrationNumber,make,model,category', actorId: 'spoofed' }), context);
    expect(response.status).toBe(400);
    expect(mocks.previewVehicleImport).not.toHaveBeenCalled();
  });
});
