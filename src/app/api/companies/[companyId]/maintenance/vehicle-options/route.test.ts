import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), listWorkOrderVehicleOptions: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: class PermissionDeniedError extends Error {} }));
vi.mock('@/modules/maintenance/work-orders', () => ({
  WorkOrderNotFoundError: class WorkOrderNotFoundError extends Error {},
  listWorkOrderVehicleOptions: mocks.listWorkOrderVehicleOptions,
}));

import { PermissionDeniedError } from '@/modules/auth/permissions';
import { GET } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };

describe('maintenance vehicle-options API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication before searching vehicles', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new Request('https://example.test?q=GT-1234'), context);
    expect(response.status).toBe(401);
    expect(mocks.listWorkOrderVehicleOptions).not.toHaveBeenCalled();
  });

  it('returns 403 when the authenticated user lacks maintenance-management scope', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'limited-user' } });
    mocks.listWorkOrderVehicleOptions.mockRejectedValue(new PermissionDeniedError());
    const response = await GET(new Request('https://example.test?q=GT-1234'), context);
    expect(response.status).toBe(403);
    expect(mocks.listWorkOrderVehicleOptions).toHaveBeenCalledWith('limited-user', 'company-1', 'GT-1234');
  });

  it('returns an uncached manager-authorized searchable projection', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
    const result = { vehicles: [{ id: 'vehicle-51', registrationNumber: 'GT-9999-26', make: 'Toyota', model: 'Hilux', odometerUnit: 'KM' }], hasMore: false };
    mocks.listWorkOrderVehicleOptions.mockResolvedValue(result);
    const response = await GET(new Request('https://example.test?q=GT-9999'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual(result);
    expect(mocks.listWorkOrderVehicleOptions).toHaveBeenCalledWith('manager-1', 'company-1', 'GT-9999');
  });
});
