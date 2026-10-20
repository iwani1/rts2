import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolvePermission: vi.fn(), getPrisma: vi.fn() }));
vi.mock('@/modules/auth/permissions', () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error { constructor() { super('Access denied'); } },
  resolvePermission: mocks.resolvePermission,
}));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));
import { getRentalRequestReport } from './rental-reports';

describe('rental request report', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns tenant-scoped persisted aggregate counts and marks unsupported metrics unavailable', async () => {
    mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['COMPANY'] });
    const statusGroups = [
      { status: 'Draft', _count: { _all: 4 } },
      { status: 'Submitted', _count: { _all: 2 } },
      { status: 'Under Review', _count: { _all: 1 } },
    ];
    const sourceGroups = [{ requestSource: 'Phone', _count: { _all: 5 } }, { requestSource: null, _count: { _all: 2 } }];
    const groupBy = vi.fn().mockResolvedValueOnce(statusGroups).mockResolvedValueOnce(sourceGroups);
    const historyCount = vi.fn().mockResolvedValue(3);
    const tx = {
      company: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) }, rentalRequest: { groupBy },
      rentalRequestStatusHistory: { count: historyCount },
    };
    const transaction = vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    mocks.getPrisma.mockReturnValue({ $transaction: transaction });
    const report = await getRentalRequestReport('manager-1', 'company-1');
    expect(report).toMatchObject({
      scope: 'all-time', totalRequests: 7, submittedRequestsEver: 3,
      statuses: [{ status: 'Draft', count: 4 }, { status: 'Submitted', count: 2 }, { status: 'Under Review', count: 1 }],
      sources: [{ source: 'Phone', count: 5 }, { source: 'Not recorded', count: 2 }],
    });
    expect(report.unavailableMetrics).toHaveLength(5);
    expect(groupBy).toHaveBeenNthCalledWith(1, expect.objectContaining({ by: ['status'], where: { companyId: 'company-1' } }));
    expect(groupBy).toHaveBeenNthCalledWith(2, expect.objectContaining({ by: ['requestSource'], where: { companyId: 'company-1' } }));
    expect(historyCount).toHaveBeenCalledWith({ where: { companyId: 'company-1', fromStatus: 'Draft', toStatus: 'Submitted' } });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
  });

  it('rejects unauthorized users before reading report data', async () => {
    mocks.resolvePermission.mockResolvedValue({ allowed: false, scopes: [] });
    const groupBy = vi.fn();
    mocks.getPrisma.mockReturnValue({ rentalRequest: { groupBy } });
    await expect(getRentalRequestReport('limited-user', 'company-1')).rejects.toThrow('Access denied');
    expect(mocks.getPrisma).not.toHaveBeenCalled();
    expect(groupBy).not.toHaveBeenCalled();
  });
});
