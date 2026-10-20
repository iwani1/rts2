import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), releaseVehicleSafetyBlock: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ api: { getSession: mocks.getSession } }) }));
vi.mock('@/modules/maintenance/vehicle-safety-blocks', () => ({
  SafetyBlockNotFoundError: class SafetyBlockNotFoundError extends Error {},
  SafetyBlockReleasePolicyError: class SafetyBlockReleasePolicyError extends Error {},
  SafetyBlockVehicleNotFoundError: class SafetyBlockVehicleNotFoundError extends Error {},
  releaseVehicleSafetyBlock: mocks.releaseVehicleSafetyBlock,
}));
import { PUT } from './route';

const context = { params: Promise.resolve({ companyId: 'company-1', vehicleId: 'vehicle-1', blockId: 'block-1' }) };

describe('PUT vehicle safety block release', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires authentication before releasing a safety block', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PUT(new Request('https://example.test', { method: 'PUT', body: '{}' }), context);
    expect(response.status).toBe(401);
    expect(mocks.releaseVehicleSafetyBlock).not.toHaveBeenCalled();
  });

  it('derives actor and path scope and forwards completion plus inspection evidence', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'fleet-manager-1' } });
    const block = { id: 'block-1', releasedAt: '2026-10-20T12:00:00.000Z' };
    mocks.releaseVehicleSafetyBlock.mockResolvedValue(block);
    const payload = {
      workCompletedAt: '2026-10-20T10:00:00.000Z', inspectionResults: 'Brake test passed on post-repair inspection',
      inspectionPassed: true, reason: 'Release after repair and approved inspection',
    };
    const response = await PUT(new Request('https://example.test', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ block });
    expect(mocks.releaseVehicleSafetyBlock).toHaveBeenCalledWith({
      ...payload, actorId: 'fleet-manager-1', companyId: 'company-1', vehicleId: 'vehicle-1', blockId: 'block-1',
    });
  });
});
