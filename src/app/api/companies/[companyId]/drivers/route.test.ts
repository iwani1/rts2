import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listDrivers: vi.fn(),
  createDriver: vi.fn(),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  DriverCompanyNotFoundError: class DriverCompanyNotFoundError extends Error {},
  InvalidDriverCursorError: class InvalidDriverCursorError extends Error {},
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: mocks.PermissionDeniedError }));
vi.mock('@/modules/fleet/drivers', () => ({
  listDrivers: mocks.listDrivers,
  createDriver: mocks.createDriver,
  DriverCompanyNotFoundError: mocks.DriverCompanyNotFoundError,
  InvalidDriverCursorError: mocks.InvalidDriverCursorError,
}));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };

describe('company driver collection API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires an authenticated session before listing drivers', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/companies/company-1/drivers'), context);
    expect(response.status).toBe(401);
    expect(mocks.listDrivers).not.toHaveBeenCalled();
  });

  it('uses session actor and route company for the read service', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.listDrivers.mockResolvedValue({ drivers: [], nextCursor: null, canManage: true });
    const response = await GET(new Request('http://localhost/api/companies/company-1/drivers?search=class'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.listDrivers).toHaveBeenCalledWith({ actorId: 'user-1', companyId: 'company-1', search: 'class', cursor: undefined });
  });

  it('creates only after authentication and derives actor from session', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.createDriver.mockResolvedValue({ id: 'driver-1' });
    const response = await POST(new Request('http://localhost/api/companies/company-1/drivers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullName: 'Verified Name' }),
    }), context);
    expect(response.status).toBe(201);
    expect(mocks.createDriver).toHaveBeenCalledWith({ fullName: 'Verified Name' }, 'user-1', 'company-1');
  });
});
