import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn(), resolvePermission: vi.fn() }));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));
vi.mock('@/modules/auth/permissions', () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error { constructor() { super('Access denied'); } },
  resolvePermission: mocks.resolvePermission,
}));

import { listRentalRequests } from './rental-requests';

describe('rental request register filtering', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['COMPANY'] });
  });

  it('combines the approved current-status and search filters within the tenant', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    mocks.getPrisma.mockReturnValue({
      company: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      rentalRequest: { findMany, findFirst: vi.fn() },
    });

    await expect(listRentalRequests({ actorId: 'manager-1', companyId: 'company-1', status: 'Under Review', search: 'Kumasi' }))
      .resolves.toMatchObject({ requests: [], nextCursor: null, canManage: true });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        companyId: 'company-1', status: 'Under Review', OR: [
          { customer: { is: { displayName: { contains: 'Kumasi', mode: 'insensitive' } } } },
          { pickupLocation: { contains: 'Kumasi', mode: 'insensitive' } },
          { destination: { contains: 'Kumasi', mode: 'insensitive' } },
        ],
      },
    }));
  });

  it('rejects statuses outside the currently active transition subset', async () => {
    await expect(listRentalRequests({ actorId: 'manager-1', companyId: 'company-1', status: 'Confirmed' })).rejects.toThrow();
    expect(mocks.resolvePermission).not.toHaveBeenCalled();
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });
});
