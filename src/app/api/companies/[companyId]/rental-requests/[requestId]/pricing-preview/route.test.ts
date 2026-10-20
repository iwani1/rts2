import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), resolvePermission: vi.fn(), getCompanyRentalPricingModels: vi.fn(), getPrisma: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: class PermissionDeniedError extends Error {}, resolvePermission: mocks.resolvePermission }));
vi.mock('@/modules/settings/registry', () => ({
  SettingNotConfiguredError: class SettingNotConfiguredError extends Error {},
  getCompanyRentalPricingModels: mocks.getCompanyRentalPricingModels,
}));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1', requestId: 'request-1' }) };
function setup({ status = 'Under Review', durationMinutes = 90, returnTime = null, returnDate = null } = {}) {
  const rentalRequest = { id: 'request-1', status, serviceDate: new Date('2026-10-20T00:00:00Z'), departureTime: '08:00', returnDate, returnTime, durationMinutes };
  mocks.getSession.mockResolvedValue({ user: { id: 'ops-1' } });
  mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['COMPANY'] });
  mocks.getPrisma.mockReturnValue({
    company: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    rentalRequest: { findFirst: vi.fn().mockResolvedValue(rentalRequest) },
  });
  return rentalRequest;
}

describe('rental request internal pricing-preview endpoint', () => {
  beforeEach(() => vi.resetAllMocks());

  it('exposes configured models only to authorized managers while Under Review', async () => {
    setup();
    const models = [{ code: 'TRIP', label: 'Trip', unit: 'PER_TRIP', ratePesewas: 10000 }];
    mocks.getCompanyRentalPricingModels.mockResolvedValue(models);
    const response = await GET(new Request('https://example.test'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ models });
  });

  it('calculates a temporary time-priced estimate from saved requested duration only', async () => {
    setup();
    mocks.getCompanyRentalPricingModels.mockResolvedValue([{ code: 'HOUR', label: 'Hourly', unit: 'PER_HOUR', ratePesewas: 6000 }]);
    const response = await POST(new Request('https://example.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelCodes: ['HOUR'] }),
    }), context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview.subtotalPesewas).toBe(9000);
    expect(body.disclaimer).toContain('Not a quotation');
  });

  it('denies unauthorized callers and blocks requests outside Under Review', async () => {
    setup();
    mocks.resolvePermission.mockResolvedValue({ allowed: false, scopes: [] });
    expect((await GET(new Request('https://example.test'), context)).status).toBe(403);
    setup({ status: 'Submitted' });
    expect((await GET(new Request('https://example.test'), context)).status).toBe(409);
    expect(mocks.getCompanyRentalPricingModels).not.toHaveBeenCalled();
  });

  it('rejects invalid model selection and missing distance without falling back', async () => {
    setup();
    mocks.getCompanyRentalPricingModels.mockResolvedValue([{ code: 'DIST', label: 'Distance', unit: 'PER_KM', ratePesewas: 2500 }]);
    const response = await POST(new Request('https://example.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelCodes: ['DIST'] }),
    }), context);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('quantity is required');
  });
});
