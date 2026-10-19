import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), isActiveSuperAdmin: vi.fn(), getCompanyRentalPricingModels: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ isActiveSuperAdmin: mocks.isActiveSuperAdmin }));
vi.mock('@/modules/settings/registry', () => ({
  CompanyNotFoundError: class CompanyNotFoundError extends Error {},
  getCompanyRentalPricingModels: mocks.getCompanyRentalPricingModels,
}));

import { GET } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };

describe('GET pricing-models endpoint', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('requires an authenticated Super Administrator and returns uncached typed models', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-1' } });
    mocks.isActiveSuperAdmin.mockResolvedValue(true);
    const models = [{ code: 'CITY', label: 'City travel', unit: 'PER_TRIP', ratePesewas: 15000 }];
    mocks.getCompanyRentalPricingModels.mockResolvedValue(models);
    const response = await GET(new Request('https://example.test'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ models });
  });

  it('denies unauthenticated and non-Super-Administrator callers', async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET(new Request('https://example.test'), context)).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.isActiveSuperAdmin.mockResolvedValue(false);
    expect((await GET(new Request('https://example.test'), context)).status).toBe(403);
    expect(mocks.getCompanyRentalPricingModels).not.toHaveBeenCalled();
  });
});
