import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), applyVehicleSafetyBlock: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/maintenance/vehicle-safety-blocks', () => ({
  ActiveSafetyBlockExistsError: class ActiveSafetyBlockExistsError extends Error {},
  SafetyBlockVehicleNotFoundError: class SafetyBlockVehicleNotFoundError extends Error {},
  applyVehicleSafetyBlock: mocks.applyVehicleSafetyBlock,
}));
import { POST } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1', vehicleId: 'vehicle-1' }) };

describe('POST vehicle safety blocks', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication before creating a block', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(new Request('https://example.test', { method: 'POST', body: '{}' }), context);
    expect(response.status).toBe(401);
    expect(mocks.applyVehicleSafetyBlock).not.toHaveBeenCalled();
  });

  it('derives actor and tenant from session and applies an uncached block', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    const block = { id: 'block-1', status: 'Pending Inspection' };
    mocks.applyVehicleSafetyBlock.mockResolvedValue(block);
    const response = await POST(new Request('https://example.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Pending Inspection', reason: 'Inspect steering vibration reported by driver' }),
    }), context);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ block });
    expect(mocks.applyVehicleSafetyBlock).toHaveBeenCalledWith({
      status: 'Pending Inspection', reason: 'Inspect steering vibration reported by driver',
      actorId: 'fleet-manager-1', companyId: 'company-1', vehicleId: 'vehicle-1',
    });
  });
});
