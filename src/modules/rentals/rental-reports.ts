import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';

export class RentalReportCompanyNotFoundError extends Error {
  constructor() { super('Rental report is not available for this company.'); this.name = 'RentalReportCompanyNotFoundError'; }
}

type RentalReportStore = {
  company: { findUnique(args: unknown): Promise<{ status: string } | null> };
  rentalRequest: { groupBy(args: unknown): Promise<unknown[]> };
  rentalRequestStatusHistory: { count(args: unknown): Promise<number> };
  rentalInvoice: { groupBy(args: unknown): Promise<unknown[]>; findMany(args: unknown): Promise<unknown[]> };
  rentalInvoicePayment: { aggregate(args: unknown): Promise<unknown>; groupBy(args: unknown): Promise<unknown[]> };
};

type GroupCount = { status?: string; requestSource?: string | null; _count: { _all: number } };
type GroupedReport = {
  statuses: Array<{ status: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
  submittedRequestsEver: number;
  invoicing: {
    recognizedRevenuePesewas: number;
    paymentsReceivedPesewas: number;
    outstandingPesewas: number;
    standingInvoiceCount: number;
    draftInvoiceCount: number;
    voidedInvoiceCount: number;
    reconciles: boolean;
  };
};

/**
 * Returns an all-time aggregate snapshot of persisted rental records.
 * Since D-091 the invoicing block reads the RentalInvoice ledger on the
 * dashboard's recognition rule: recognised revenue = ISSUED + PAID totals,
 * payments = recorded payment sums, outstanding derives per ISSUED
 * invoice — the same identity the finance dashboard proves.
 */
export async function getRentalRequestReport(actorIdInput: string, companyIdInput: string) {
  const actorId = actorIdInput.trim();
  const companyId = companyIdInput.trim();
  if (!actorId || actorId.length > 128 || !companyId || companyId.length > 128) throw new RentalReportCompanyNotFoundError();
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'rental:manage' });
  if (!access.allowed || !access.scopes.some((scope) => ['COMPANY', 'GLOBAL'].includes(scope))) throw new PermissionDeniedError();
  const prisma = getPrisma();
  const { statuses, sources, submittedRequestsEver, invoicing }: GroupedReport = await prisma.$transaction(async (transactionClient: unknown): Promise<GroupedReport> => {
    const tx = transactionClient as RentalReportStore;
    const store = tx as unknown as RentalReportStore;
    const company = await store.company.findUnique({ where: { id: companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new RentalReportCompanyNotFoundError();
    const [statusGroups, sourceGroups, submittedRequestsEver, invoiceStatusGroups, paymentsAggregate, issuedInvoices] = await Promise.all([
      store.rentalRequest.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true }, orderBy: { status: 'asc' } }),
      store.rentalRequest.groupBy({ by: ['requestSource'], where: { companyId }, _count: { _all: true }, orderBy: { requestSource: 'asc' } }),
      store.rentalRequestStatusHistory.count({ where: { companyId, fromStatus: 'Draft', toStatus: 'Submitted' } }),
      store.rentalInvoice.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true }, _sum: { totalPesewas: true } }),
      store.rentalInvoicePayment.aggregate({ where: { companyId }, _sum: { amountPesewas: true } }),
      store.rentalInvoice.findMany({ where: { companyId, status: 'ISSUED' }, select: { id: true, totalPesewas: true } }),
    ]) as [GroupCount[], GroupCount[], number,
      Array<{ status?: string; _count: { _all: number }; _sum: { totalPesewas: number | null } }>,
      { _sum: { amountPesewas: number | null } },
      Array<{ id: string; totalPesewas: number }>];
    const issuedInvoiceIds = issuedInvoices.map((invoice) => invoice.id);
    const paymentsByIssuedInvoice = (issuedInvoiceIds.length > 0
      ? await store.rentalInvoicePayment.groupBy({
        by: ['invoiceId'], where: { companyId, invoiceId: { in: issuedInvoiceIds } }, _sum: { amountPesewas: true },
      })
      : []) as Array<{ invoiceId: string; _sum: { amountPesewas: number | null } }>;
    const paidByInvoice = new Map(paymentsByIssuedInvoice.map((row) => [row.invoiceId, row._sum.amountPesewas ?? 0]));
    const outstandingPesewas = issuedInvoices
      .reduce((sum, invoice) => sum + invoice.totalPesewas - (paidByInvoice.get(invoice.id) ?? 0), 0);
    const invoiceTotalFor = (status: string) => invoiceStatusGroups.find((row) => row.status === status)?._sum.totalPesewas ?? 0;
    const invoiceCountFor = (status: string) => invoiceStatusGroups.find((row) => row.status === status)?._count._all ?? 0;
    const recognizedRevenuePesewas = invoiceTotalFor('ISSUED') + invoiceTotalFor('PAID');
    const paymentsReceivedPesewas = paymentsAggregate._sum.amountPesewas ?? 0;
    return {
      statuses: statusGroups.map(({ status, _count }) => ({ status: status ?? 'Unspecified', count: _count._all })),
      sources: sourceGroups.map(({ requestSource, _count }) => ({ source: requestSource ?? 'Not recorded', count: _count._all })),
      submittedRequestsEver,
      invoicing: {
        recognizedRevenuePesewas,
        paymentsReceivedPesewas,
        outstandingPesewas,
        standingInvoiceCount: invoiceCountFor('ISSUED') + invoiceCountFor('PAID'),
        draftInvoiceCount: invoiceCountFor('DRAFT'),
        voidedInvoiceCount: invoiceCountFor('VOID'),
        reconciles: recognizedRevenuePesewas === paymentsReceivedPesewas + outstandingPesewas,
      },
    };
  }, { isolationLevel: 'RepeatableRead' });
  return {
    generatedAt: new Date().toISOString(),
    scope: 'all-time',
    totalRequests: statuses.reduce((total, item) => total + item.count, 0),
    statuses,
    sources,
    submittedRequestsEver,
    invoicing,
    unavailableMetrics: [
      { metric: 'Quotations issued and acceptance rate', reason: 'Quotation records and customer decisions exist per request, but this all-time snapshot does not compute issued counts or acceptance rates.' },
      { metric: 'Vehicle utilisation', reason: 'Assignment records exist, but no fleet availability calendar is modelled, so utilisation is not computed.' },
      { metric: 'Cancellation reasons', reason: 'Cancellations are recorded in the status ledger, but this snapshot does not group them by recorded reason.' },
    ],
  };
}
