import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';

export class RentalReportCompanyNotFoundError extends Error {
  constructor() { super('Rental report is not available for this company.'); this.name = 'RentalReportCompanyNotFoundError'; }
}

type RentalReportStore = {
  company: { findUnique(args: unknown): Promise<{ status: string } | null> };
  rentalRequest: { groupBy(args: unknown): Promise<unknown[]> };
  rentalRequestStatusHistory: { count(args: unknown): Promise<number> };
};

type GroupCount = { status?: string; requestSource?: string | null; _count: { _all: number } };
type GroupedReport = {
  statuses: Array<{ status: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
  submittedRequestsEver: number;
};

/** Returns an all-time aggregate snapshot of persisted rental enquiry records only. */
export async function getRentalRequestReport(actorIdInput: string, companyIdInput: string) {
  const actorId = actorIdInput.trim();
  const companyId = companyIdInput.trim();
  if (!actorId || actorId.length > 128 || !companyId || companyId.length > 128) throw new RentalReportCompanyNotFoundError();
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'rental:manage' });
  if (!access.allowed || !access.scopes.some((scope) => ['COMPANY', 'GLOBAL'].includes(scope))) throw new PermissionDeniedError();
  const prisma = getPrisma();
  const { statuses, sources, submittedRequestsEver }: GroupedReport = await prisma.$transaction(async (transactionClient: unknown): Promise<GroupedReport> => {
    const tx = transactionClient as RentalReportStore;
    const store = tx as unknown as RentalReportStore;
    const company = await store.company.findUnique({ where: { id: companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new RentalReportCompanyNotFoundError();
    const [statusGroups, sourceGroups, submittedRequestsEver] = await Promise.all([
      store.rentalRequest.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true }, orderBy: { status: 'asc' } }),
      store.rentalRequest.groupBy({ by: ['requestSource'], where: { companyId }, _count: { _all: true }, orderBy: { requestSource: 'asc' } }),
      store.rentalRequestStatusHistory.count({ where: { companyId, fromStatus: 'Draft', toStatus: 'Submitted' } }),
    ]) as [GroupCount[], GroupCount[], number];
    return {
      statuses: statusGroups.map(({ status, _count }) => ({ status: status ?? 'Unspecified', count: _count._all })),
      sources: sourceGroups.map(({ requestSource, _count }) => ({ source: requestSource ?? 'Not recorded', count: _count._all })),
      submittedRequestsEver,
    };
  }, { isolationLevel: 'RepeatableRead' });
  return {
    generatedAt: new Date().toISOString(),
    scope: 'all-time',
    totalRequests: statuses.reduce((total, item) => total + item.count, 0),
    statuses,
    sources,
    submittedRequestsEver,
    unavailableMetrics: [
      { metric: 'Quotations issued and acceptance rate', reason: 'Formal quotation issuance and customer acceptance are not implemented.' },
      { metric: 'Confirmed and completed rentals', reason: 'Rental confirmation and completion transitions are not implemented.' },
      { metric: 'Revenue and outstanding balances', reason: 'Rental invoices and verified payment records are not implemented.' },
      { metric: 'Vehicle utilisation', reason: 'Reservation and assignment records are not implemented.' },
      { metric: 'Cancellation reasons', reason: 'Rental cancellation transitions and reason records are not implemented.' },
    ],
  };
}
