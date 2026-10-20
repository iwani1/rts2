import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createWorkOrder: vi.fn(), listWorkOrders: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: class PermissionDeniedError extends Error {} }));
vi.mock('@/modules/maintenance/work-orders', () => ({
  WorkOrderNotFoundError: class WorkOrderNotFoundError extends Error {},
  InvalidWorkOrderCursorError: class InvalidWorkOrderCursorError extends Error { constructor() { super('Invalid work-order page cursor.'); } },
  WorkOrderPolicyError: class WorkOrderPolicyError extends Error {},
  createWorkOrder: mocks.createWorkOrder,
  listWorkOrders: mocks.listWorkOrders,
}));
import { InvalidWorkOrderCursorError } from '@/modules/maintenance/work-orders';
import { GET, POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1' }) };

describe('maintenance work-order API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication for listing', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new Request('https://example.test'), context);
    expect(response.status).toBe(401);
    expect(mocks.listWorkOrders).not.toHaveBeenCalled();
  });

  it('returns a private uncached company-scoped list', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    const workOrders = [{ id: 'wo-1', reference: 'WO-AABBCCDDEEFF0011' }];
    mocks.listWorkOrders.mockResolvedValue({ workOrders, nextCursor: 'wo-next' });
    const response = await GET(new Request('https://example.test'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ workOrders, nextCursor: 'wo-next' });
    expect(mocks.listWorkOrders).toHaveBeenCalledWith('fleet-manager-1', 'company-1');
  });

  it('passes an explicit status filter to the tenant-scoped list service', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    mocks.listWorkOrders.mockResolvedValue({ workOrders: [], nextCursor: null });
    const response = await GET(new Request('https://example.test?status=Awaiting%20Review&q=door&cursor=wo-12'), context);
    expect(response.status).toBe(200);
    expect(mocks.listWorkOrders).toHaveBeenCalledWith('fleet-manager-1', 'company-1', 'Awaiting Review', 'door', 'wo-12');
  });

  it('returns a client error for a cursor outside the manager company', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    mocks.listWorkOrders.mockRejectedValue(new InvalidWorkOrderCursorError());
    const response = await GET(new Request('https://example.test?cursor=foreign-cursor'), context);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid work-order page cursor.' });
  });

  it('derives actor and tenant from the authenticated route and returns the Reported record', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    const workOrder = { id: 'wo-1', reference: 'WO-AABBCCDDEEFF0011', status: 'Reported' };
    mocks.createWorkOrder.mockResolvedValue(workOrder);
    const payload = {
      vehicleId: 'vehicle-1', reportedFault: 'Front left door latch sticks when opened', dateReported: '2026-10-20',
      safetyRelated: false, reason: 'Log routine maintenance inspection for fleet',
    };
    const response = await POST(new Request('https://example.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }), context);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ workOrder });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.createWorkOrder).toHaveBeenCalledWith({ ...payload, actorId: 'fleet-manager-1', companyId: 'company-1' });
  });
});
