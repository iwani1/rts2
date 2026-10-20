import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createRentalPricingWorksheet: vi.fn(), listRentalPricingWorksheets: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: class PermissionDeniedError extends Error {} }));
vi.mock('@/modules/rentals/pricing-worksheets', () => ({
  PricingWorksheetPolicyError: class PricingWorksheetPolicyError extends Error {},
  PricingWorksheetUnavailableError: class PricingWorksheetUnavailableError extends Error {},
  createRentalPricingWorksheet: mocks.createRentalPricingWorksheet,
  listRentalPricingWorksheets: mocks.listRentalPricingWorksheets,
}));
import { GET, POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1', requestId: 'request-1' }) };

describe('pricing-worksheets endpoint', () => {
  beforeEach(() => vi.resetAllMocks());

  it('derives actor and scope from session, returns the immutable worksheet uncached', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
    const worksheet = { id: 'ws-1', version: 1, preTaxSubtotalPesewas: 8000 };
    mocks.createRentalPricingWorksheet.mockResolvedValue(worksheet);
    const response = await POST(new Request('https://example.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelCodes: ['TRIP'], reason: 'Prepared an internal pricing worksheet' }),
    }), context);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ worksheet });
    expect(mocks.createRentalPricingWorksheet).toHaveBeenCalledWith({
      modelCodes: ['TRIP'], reason: 'Prepared an internal pricing worksheet', actorId: 'manager-1', companyId: 'company-1', requestId: 'request-1',
    });
  });

  it('returns scoped worksheet version history uncached', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
    const worksheets = [{ id: 'ws-1', version: 1, preTaxSubtotalPesewas: 8000, reason: 'Prepared an internal pricing worksheet', createdAt: '2026-10-19T12:00:00Z' }];
    mocks.listRentalPricingWorksheets.mockResolvedValue(worksheets);
    const response = await GET(new Request('https://example.test'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ worksheets });
    expect(mocks.listRentalPricingWorksheets).toHaveBeenCalledWith('manager-1', 'company-1', 'request-1');
  });

  it('requires authentication before attempting to save', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(new Request('https://example.test', { method: 'POST', body: '{}' }), context);
    expect(response.status).toBe(401);
    expect(mocks.createRentalPricingWorksheet).not.toHaveBeenCalled();
  });
});
