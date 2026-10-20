import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), transitionWorkOrder: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/auth/permissions', () => ({ PermissionDeniedError: class PermissionDeniedError extends Error {} }));
vi.mock('@/modules/maintenance/work-orders', () => ({
  WorkOrderNotFoundError: class WorkOrderNotFoundError extends Error {},
  WorkOrderPolicyError: class WorkOrderPolicyError extends Error {},
  transitionWorkOrder: mocks.transitionWorkOrder,
}));
import { PATCH } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1', workOrderId: 'wo-1' }) };

describe('maintenance work-order transition API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(new Request('https://example.test', { method: 'PATCH', body: '{}' }), context);
    expect(response.status).toBe(401);
    expect(mocks.transitionWorkOrder).not.toHaveBeenCalled();
  });

  it('takes actor and tenant identity from the authenticated request and disables caching', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'manager-1' } });
    const payload = { toStatus: 'Awaiting Inspection', reason: 'Move to inspection queue for assessment' };
    const workOrder = { id: 'wo-1', status: 'Awaiting Inspection' };
    mocks.transitionWorkOrder.mockResolvedValue(workOrder);
    const response = await PATCH(new Request('https://example.test', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ workOrder });
    expect(mocks.transitionWorkOrder).toHaveBeenCalledWith({ ...payload, actorId: 'manager-1', companyId: 'company-1', workOrderId: 'wo-1' });
  });
});
