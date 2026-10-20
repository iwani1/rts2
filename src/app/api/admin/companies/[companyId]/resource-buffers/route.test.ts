import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), isActiveSuperAdmin: vi.fn(), getCompanyResourceBuffers: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ isActiveSuperAdmin: mocks.isActiveSuperAdmin }));
vi.mock('@/modules/settings/registry', () => ({
  getCompanyResourceBuffers: mocks.getCompanyResourceBuffers,
  CompanyNotFoundError: class CompanyNotFoundError extends Error {},
}));

import { GET } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };
const request = () => new Request('http://localhost/api/admin/companies/company-1/resource-buffers');

describe('typed resource buffer settings API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires an active Super Administrator', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.isActiveSuperAdmin.mockResolvedValue(false);
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.getCompanyResourceBuffers).not.toHaveBeenCalled();
  });

  it('returns only the two uncached typed buffer values', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-1' } });
    mocks.isActiveSuperAdmin.mockResolvedValue(true);
    mocks.getCompanyResourceBuffers.mockResolvedValue({ vehicleBufferMinutes: 0, driverBufferMinutes: null });
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.getCompanyResourceBuffers).toHaveBeenCalledWith('company-1');
    await expect(response.json()).resolves.toEqual({ vehicleBufferMinutes: 0, driverBufferMinutes: null });
  });
});
