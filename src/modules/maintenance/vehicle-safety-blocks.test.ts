import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn(), resolvePermission: vi.fn() }));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));
vi.mock('@/modules/auth/permissions', () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error { constructor() { super('Access denied'); } },
  resolvePermission: mocks.resolvePermission,
}));

import { applyVehicleSafetyBlock, releaseVehicleSafetyBlock, safetyStatusForVehicles } from './vehicle-safety-blocks';

const applyInput = { actorId: 'manager-1', companyId: 'company-1', vehicleId: 'vehicle-1', status: 'Pending Inspection', reason: 'Driver reported steering vibration requiring inspection' };
const releaseInput = {
  actorId: 'fleet-manager-1', companyId: 'company-1', vehicleId: 'vehicle-1', blockId: 'block-1',
  workCompletedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  inspectionResults: 'Steering linkage checked and safe during road test', inspectionPassed: true,
  reason: 'Release after completed repair and passed inspection',
};

function fixture({ applyScopes = ['COMPANY'], releaseScopes = ['APPROVE_RELEASE'], noActive = false } = {}) {
  const block = { id: 'block-1', status: 'Pending Inspection', reason: applyInput.reason, appliedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) };
  const tx = {
    company: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'vehicle-1' }]),
    vehicleSafetyBlock: {
      findFirst: vi.fn().mockResolvedValue(noActive ? null : block),
      findMany: vi.fn().mockResolvedValue([{ id: 'block-1', vehicleId: 'vehicle-1', status: 'Pending Inspection', appliedAt: block.appliedAt }]),
      create: vi.fn().mockResolvedValue(block), update: vi.fn().mockResolvedValue({ ...block, releasedAt: new Date() }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const transaction = vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  mocks.getPrisma.mockReturnValue({ $transaction: transaction });
  mocks.resolvePermission.mockImplementation(async ({ permission }: { permission: string }) => ({
    allowed: true, scopes: permission === 'fleet:manage' ? applyScopes : releaseScopes,
  }));
  return { tx, transaction, block };
}

describe('vehicle safety block lifecycle', () => {
  beforeEach(() => vi.resetAllMocks());

  it('applies an immediate company-scoped safety block and audits it transactionally', async () => {
    const { tx } = fixture({ noActive: true });
    await expect(applyVehicleSafetyBlock(applyInput)).resolves.toMatchObject({ id: 'block-1', status: 'Pending Inspection' });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.vehicleSafetyBlock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ companyId: 'company-1', vehicleId: 'vehicle-1', status: 'Pending Inspection', appliedById: 'manager-1' }),
    }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'VEHICLE_SAFETY_BLOCK_APPLIED', entityType: 'VEHICLE_SAFETY_BLOCK' }),
    }));
  });

  it('refuses a second active block rather than overwriting its status or reason', async () => {
    const { tx } = fixture();
    await expect(applyVehicleSafetyBlock(applyInput)).rejects.toThrow('already has an active');
    expect(tx.vehicleSafetyBlock.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('denies users without manager authority to apply safety blocks', async () => {
    const { transaction } = fixture({ applyScopes: ['READ_ASSIGN_SUBSET'] });
    await expect(applyVehicleSafetyBlock(applyInput)).rejects.toThrow('Access denied');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('releases only after recorded completion and a passed inspection, then audits', async () => {
    const { tx } = fixture();
    await expect(releaseVehicleSafetyBlock(releaseInput)).resolves.toMatchObject({ id: 'block-1' });
    expect(tx.vehicleSafetyBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'block-1' },
      data: expect.objectContaining({ releasedById: 'fleet-manager-1', inspectionPassed: true, inspectionResults: releaseInput.inspectionResults }),
    }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'VEHICLE_SAFETY_BLOCK_RELEASED', entityType: 'VEHICLE_SAFETY_BLOCK' }),
    }));
  });

  it('prevents technicians from releasing a block', async () => {
    const { transaction } = fixture({ releaseScopes: ['WORK_ORDER_UPDATE_NO_RELEASE'] });
    await expect(releaseVehicleSafetyBlock(releaseInput)).rejects.toThrow('Access denied');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a release with a failed inspection or completion before the block', async () => {
    fixture();
    await expect(releaseVehicleSafetyBlock({ ...releaseInput, inspectionPassed: false })).rejects.toThrow();
    await expect(releaseVehicleSafetyBlock({ ...releaseInput, workCompletedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() })).rejects.toThrow('after the safety block');
  });

  it('filters block reasons from limited fleet projections but includes them for full managers', async () => {
    const { tx } = fixture();
    const findMany = vi.fn().mockResolvedValue([{ id: 'block-1', vehicleId: 'vehicle-1', status: 'Pending Inspection', appliedAt: new Date(), reason: 'Steering requires inspection' }]);
    mocks.getPrisma.mockReturnValue({ vehicleSafetyBlock: { ...tx.vehicleSafetyBlock, findMany } });
    const limited = await safetyStatusForVehicles('company-1', ['vehicle-1']);
    expect(limited.get('vehicle-1')).toMatchObject({ id: 'block-1', status: 'Pending Inspection' });
    expect(limited.get('vehicle-1')).not.toHaveProperty('reason');
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { companyId: 'company-1', vehicleId: { in: ['vehicle-1'] }, releasedAt: null },
      select: { id: true, vehicleId: true, status: true, appliedAt: true },
    }));
    const manager = await safetyStatusForVehicles('company-1', ['vehicle-1'], true);
    expect(manager.get('vehicle-1')?.reason).toBe('Steering requires inspection');
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ select: { id: true, vehicleId: true, status: true, appliedAt: true, reason: true } }));
  });
});
