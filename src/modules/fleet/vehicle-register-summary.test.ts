import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getVehicleRegisterSummary } from './vehicles';

const mocks = vi.hoisted(() => ({
  resolvePermission: vi.fn(),
  companyFindUnique: vi.fn(),
  vehicleGroupBy: vi.fn(),
}));

vi.mock('@/modules/auth/permissions', () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error {},
  resolvePermission: mocks.resolvePermission,
}));
vi.mock('@/server/prisma', () => ({
  getPrisma: () => ({
    company: { findUnique: mocks.companyFindUnique },
    vehicle: { groupBy: mocks.vehicleGroupBy },
  }),
}));

afterEach(() => vi.clearAllMocks());
beforeEach(() => {
  mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['COMPANY'] });
  mocks.companyFindUnique.mockResolvedValue({ status: 'ACTIVE' });
  mocks.vehicleGroupBy.mockResolvedValue([
    { category: 'Coach', _count: { _all: 2 } },
    { category: 'Minibus', _count: { _all: 3 } },
  ]);
});

describe('getVehicleRegisterSummary', () => {
  it('returns company-scoped counts for non-archived records grouped by supplied category', async () => {
    const summary = await getVehicleRegisterSummary({ actorId: 'manager-1', companyId: 'company-1' });

    expect(mocks.resolvePermission).toHaveBeenCalledWith({ userId: 'manager-1', companyId: 'company-1', permission: 'fleet:manage' });
    expect(mocks.vehicleGroupBy).toHaveBeenCalledWith({
      by: ['category'],
      where: { companyId: 'company-1', archivedAt: null },
      _count: { _all: true },
      orderBy: { category: 'asc' },
    });
    expect(summary).toEqual({
      registeredVehicleCount: 5,
      byCategory: [{ category: 'Coach', count: 2 }, { category: 'Minibus', count: 3 }],
    });
  });

  it('denies limited fleet scopes before querying category data', async () => {
    mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['ASSIGNED_EXECUTION'] });

    await expect(getVehicleRegisterSummary({ actorId: 'dispatcher-1', companyId: 'company-1' }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    expect(mocks.vehicleGroupBy).not.toHaveBeenCalled();
  });
});
