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
    const invoiceGroupBy = vi.fn().mockResolvedValue([
      { status: 'ISSUED', _count: { _all: 1 }, _sum: { totalPesewas: 9900 } },
      { status: 'PAID', _count: { _all: 1 }, _sum: { totalPesewas: 9000 } },
      { status: 'DRAFT', _count: { _all: 1 }, _sum: { totalPesewas: 5000 } },
    ]);
    const invoiceFindMany = vi.fn().mockResolvedValue([{ id: 'inv-2', totalPesewas: 9900 }]);
    const paymentAggregate = vi.fn().mockResolvedValue({ _sum: { amountPesewas: 9100 } });
    const paymentGroupBy = vi.fn().mockResolvedValue([{ invoiceId: 'inv-2', _sum: { amountPesewas: 100 } }]);
    const tx = {
      company: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) }, rentalRequest: { groupBy },
      rentalRequestStatusHistory: { count: historyCount },
      rentalInvoice: { groupBy: invoiceGroupBy, findMany: invoiceFindMany },
      rentalInvoicePayment: { aggregate: paymentAggregate, groupBy: paymentGroupBy },
    };
    const transaction = vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    mocks.getPrisma.mockReturnValue({ $transaction: transaction });
    const report = await getRentalRequestReport('manager-1', 'company-1');
    expect(report).toMatchObject({
      scope: 'all-time', totalRequests: 7, submittedRequestsEver: 3,
      statuses: [{ status: 'Draft', count: 4 }, { status: 'Submitted', count: 2 }, { status: 'Under Review', count: 1 }],
      sources: [{ source: 'Phone', count: 5 }, { source: 'Not recorded', count: 2 }],
    });
    expect(report.invoicing).toEqual({
      recognizedRevenuePesewas: 18900, paymentsReceivedPesewas: 9100, outstandingPesewas: 9800,
      standingInvoiceCount: 2, draftInvoiceCount: 1, voidedInvoiceCount: 0, reconciles: true,
    });
    expect(report.unavailableMetrics).toHaveLength(3);
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
