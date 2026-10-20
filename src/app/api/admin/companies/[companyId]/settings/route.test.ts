import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isActiveSuperAdmin: vi.fn(),
  listCompanySettingStatus: vi.fn(),
  setCompanySetting: vi.fn(),
}));

vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({
  isActiveSuperAdmin: mocks.isActiveSuperAdmin,
  PermissionDeniedError: class PermissionDeniedError extends Error {},
}));
vi.mock('@/modules/settings/registry', () => ({
  listCompanySettingStatus: mocks.listCompanySettingStatus,
  setCompanySetting: mocks.setCompanySetting,
  CompanyNotFoundError: class CompanyNotFoundError extends Error {},
}));

import { GET, PUT } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };
const session = { user: { id: 'admin-user' } };

function putRequest(body: unknown) {
  return new Request('http://localhost/api/admin/companies/company-1/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Super Administrator company settings API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires a signed-in session for settings status', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/admin/companies/company-1/settings'), context);
    expect(response.status).toBe(401);
    expect(mocks.listCompanySettingStatus).not.toHaveBeenCalled();
  });

  it('denies settings access to non-Super-Administrators', async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.isActiveSuperAdmin.mockResolvedValue(false);
    const response = await GET(new Request('http://localhost/api/admin/companies/company-1/settings'), context);
    expect(response.status).toBe(403);
    expect(mocks.listCompanySettingStatus).not.toHaveBeenCalled();
  });

  it('returns uncached setting status for the requested company', async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.isActiveSuperAdmin.mockResolvedValue(true);
    const settings = [{ key: 'finance.tax_lines', configured: false }];
    mocks.listCompanySettingStatus.mockResolvedValue(settings);
    const response = await GET(new Request('http://localhost/api/admin/companies/company-1/settings'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.listCompanySettingStatus).toHaveBeenCalledWith('company-1');
    await expect(response.json()).resolves.toEqual({ settings });
  });

  it('derives actor and company from trusted server context when writing', async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.isActiveSuperAdmin.mockResolvedValue(true);
    mocks.setCompanySetting.mockResolvedValue({ key: 'finance.tax_lines', configured: true });
    const response = await PUT(putRequest({
      key: 'finance.tax_lines', value: [{ rate: 'owner supplied' }], reason: 'Owner confirmed tax settings',
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.setCompanySetting).toHaveBeenCalledWith({
      actorId: 'admin-user', companyId: 'company-1', key: 'finance.tax_lines',
      value: [{ rate: 'owner supplied' }], reason: 'Owner confirmed tax settings',
    });
  });

  it('rejects identity fields supplied by the client', async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.isActiveSuperAdmin.mockResolvedValue(true);
    const response = await PUT(putRequest({
      key: 'finance.tax_lines', value: [], reason: 'Owner confirmed tax settings', actorId: 'spoofed',
    }), context);
    expect(response.status).toBe(400);
    expect(mocks.setCompanySetting).not.toHaveBeenCalled();
  });
});
