import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listVehicles: vi.fn(),
  createVehicle: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  FleetCompanyNotFoundError: class FleetCompanyNotFoundError extends Error {},
  InvalidVehicleCursorError: class InvalidVehicleCursorError extends Error {},
  InvalidUsualDriverError: class InvalidUsualDriverError extends Error {},
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/fleet/vehicles', () => ({
  listVehicles: mocks.listVehicles,
  createVehicle: mocks.createVehicle,
  FleetCompanyNotFoundError: mocks.FleetCompanyNotFoundError,
  InvalidVehicleCursorError: mocks.InvalidVehicleCursorError,
  InvalidUsualDriverError: mocks.InvalidUsualDriverError,
  isUniqueVehicleError: (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002',
}));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };

describe('company vehicle collection API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires an authenticated session before reading vehicles', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/companies/company-1/vehicles'), context);
    expect(response.status).toBe(401);
    expect(mocks.listVehicles).not.toHaveBeenCalled();
  });

  it('uses the session actor and route tenant for the authorized service request', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.listVehicles.mockResolvedValue({ vehicles: [], nextCursor: null, canManage: true });
    const response = await GET(new Request('http://localhost/api/companies/company-1/vehicles?search=bus'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.listVehicles).toHaveBeenCalledWith({ actorId: 'user-1', companyId: 'company-1', search: 'bus', cursor: undefined });
  });

  it('creates only after authentication and derives the actor from the session', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.createVehicle.mockResolvedValue({ id: 'vehicle-1' });
    const response = await POST(new Request('http://localhost/api/companies/company-1/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ registrationNumber: 'GH-1' }),
    }), context);
    expect(response.status).toBe(201);
    expect(mocks.createVehicle).toHaveBeenCalledWith({ registrationNumber: 'GH-1' }, 'user-1', 'company-1');
  });

  it('returns a client error for an invalid same-company usual-driver selection', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.createVehicle.mockRejectedValue(new mocks.InvalidUsualDriverError());
    const response = await POST(new Request('http://localhost/api/companies/company-1/vehicles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usualDriverId: 'other-company-driver' }),
    }), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Select an active driver in this operator company.' });
  });
});
