import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), isActiveSuperAdmin: vi.fn(), getOnTimeThresholdMinutes: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ isActiveSuperAdmin: mocks.isActiveSuperAdmin }));
vi.mock('@/modules/settings/registry', () => ({
  getOnTimeThresholdMinutes: mocks.getOnTimeThresholdMinutes,
  CompanyNotFoundError: class CompanyNotFoundError extends Error {},
}));

import { GET } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };
const request = () => new Request('http://localhost/api/admin/companies/company-1/on-time-threshold');

describe('on-time threshold API (RPT-02 / D-078)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires an authenticated Super Administrator', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.isActiveSuperAdmin.mockResolvedValue(false);
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.getOnTimeThresholdMinutes).not.toHaveBeenCalled();
  });

  it('returns the explicit value or null without caching', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-1' } });
    mocks.isActiveSuperAdmin.mockResolvedValue(true);
    mocks.getOnTimeThresholdMinutes.mockResolvedValue(10);
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.getOnTimeThresholdMinutes).toHaveBeenCalledWith('company-1');
    await expect(response.json()).resolves.toEqual({ thresholdMinutes: 10 });
  });
});
