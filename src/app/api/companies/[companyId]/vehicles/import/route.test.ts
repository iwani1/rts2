import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  importVehiclesFromCsv: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  FleetCompanyNotFoundError: class FleetCompanyNotFoundError extends Error {},
  VehicleImportValidationError: class VehicleImportValidationError extends Error {
    constructor(readonly preview: unknown) { super('Fix every row before importing.'); }
  },
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/fleet/vehicles', () => ({
  importVehiclesFromCsv: mocks.importVehiclesFromCsv,
  FleetCompanyNotFoundError: mocks.FleetCompanyNotFoundError,
  VehicleImportValidationError: mocks.VehicleImportValidationError,
}));

import { POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };
const makeRequest = (body: unknown) => new Request('http://localhost/api/companies/company-1/vehicles/import', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('vehicle import API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication before writing vehicle records', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(makeRequest({ csv: 'csv', reason: 'Verified fleet records' }), context);
    expect(response.status).toBe(401);
    expect(mocks.importVehiclesFromCsv).not.toHaveBeenCalled();
  });

  it('uses the session actor and route company for import', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    mocks.importVehiclesFromCsv.mockResolvedValue({ importedCount: 1, vehicles: [{ id: 'vehicle-1', registrationNumber: 'GR-1', make: 'Toyota', model: 'Coaster' }] });
    const body = { csv: 'registrationNumber,make,model,category\nGR-1,Toyota,Coaster,Bus', reason: 'Verified fleet records' };
    const response = await POST(makeRequest(body), context);
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.importVehiclesFromCsv).toHaveBeenCalledWith({ ...body, actorId: 'fleet-manager-1', companyId: 'company-1' });
  });

  it('returns validation preview and rejects malformed requests', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    const preview = { totalRows: 1, validRows: 0, invalidRows: 1, canImport: false, fileErrors: [], rows: [] };
    mocks.importVehiclesFromCsv.mockRejectedValue(new mocks.VehicleImportValidationError(preview));
    const response = await POST(makeRequest({ csv: 'bad', reason: 'Verified fleet records' }), context);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ preview });

    const invalidBody = await POST(makeRequest({ csv: 'bad', reason: 'short' }), context);
    expect(invalidBody.status).toBe(400);
  });
});
