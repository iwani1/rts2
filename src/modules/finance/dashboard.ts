import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { financeDashboardQuerySchema } from './dashboard-schema';
import { summariseFinanceDashboard } from './dashboard-summary';

const companyIdSchema = z.string().trim().min(1).max(128);

export class FinanceDashboardCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'FinanceDashboardCompanyNotFoundError'; }
}

export type FinanceCoveragePair = { numerator: number; denominator: number };

export type FinanceDashboard = {
  generatedAt: string;
  window: { fromDate: string | null; toDate: string | null };
  recognizedRevenuePesewas: number;
  paymentsReceivedPesewas: number;
  outstandingPesewas: number;
  draftPipelinePesewas: number;
  draftInvoiceCount: number;
  voidedInvoiceCount: number;
  voidedTotalPesewas: number;
  countsByStatus: Array<{ status: string; invoiceCount: number; totalPesewas: number }>;
  clients: Array<{
    clientId: string; clientName: string; standingInvoiceCount: number;
    invoicedPesewas: number; paidPesewas: number; outstandingPesewas: number;
  }>;
  paymentsByMethod: Array<{ method: string; paymentCount: number; amountPesewas: number }>;
  activity: {
    paymentsReceivedPesewas: number;
    paymentCount: number;
    invoicesIssuedCount: number;
    revenueRecognizedPesewas: number;
  };
  coverage: {
    issuedInvoicesWithTimestamp: FinanceCoveragePair;
    paymentsWithMethod: FinanceCoveragePair;
    paymentsWithReference: FinanceCoveragePair;
  };
  reconciliation: {
    recognizedRevenuePesewas: number;
    paymentsReceivedPesewas: number;
    outstandingPesewas: number;
    reconciles: boolean;
  };
  margin: { status: 'INSUFFICIENT_DATA'; reason: string };
  unavailableMetrics: Array<{ metric: string; reason: string }>;
};

const UNAVAILABLE_METRICS = [
  {
    metric: 'Estimated margin',
    reason: 'Margin is shown only when cost and revenue data are sufficient (FIN-07). Attributable cost records do not exist yet: expenses are FIN-05 (Phase 3) and maintenance work-order costs cannot be attributed to invoices or trips, so no margin figure is presented.',
  },
  {
    metric: 'Rental revenue and rental outstanding balances',
    reason: 'Rental invoices and rental payment records are not implemented; quotation values are never treated as revenue.',
  },
  {
    metric: 'Expenses by category, cost per trip and cost per passenger',
    reason: 'No expense records exist yet (FIN-05 is Phase 3). Costs are never imputed or allocated without a recorded basis.',
  },
  {
    metric: 'Outstanding ageing by due date',
    reason: 'Corporate invoices do not carry due dates yet, so outstanding is grouped by client instead of being aged.',
  },
];

/**
 * FIN-07 / D-063: read-only finance dashboard whose totals reconcile to the
 * corporate invoice and payment transaction records. Revenue counts ISSUED +
 * PAID invoices only, payments are the append-only InvoicePayment sums, and
 * outstanding is derived per invoice — never stored. The optional window
 * drives only the activity section (payments by receivedAt, recognition by
 * the append-only ISSUED history timestamp); balances are point-in-time.
 */
export async function getFinanceDashboard(input: {
  actorId: string; companyId: string; fromDate?: string; toDate?: string;
}): Promise<FinanceDashboard> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = financeDashboardQuerySchema.parse({
    fromDate: input.fromDate || undefined, toDate: input.toDate || undefined,
  });
  const permission = await resolvePermission({ userId: input.actorId, companyId, permission: 'invoice:manage' });
  if (!permission.allowed || !(permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY'))) {
    throw new PermissionDeniedError();
  }
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new FinanceDashboardCompanyNotFoundError();

  // Africa/Accra keeps UTC year-round (no daylight saving), so UTC day bounds
  // are the local day bounds docs/KPIS.md requires (D-063).
  const windowStart = query.fromDate ? new Date(`${query.fromDate}T00:00:00.000Z`) : undefined;
  const windowEndExclusive = query.toDate
    ? new Date(new Date(`${query.toDate}T00:00:00.000Z`).getTime() + 86_400_000)
    : undefined;
  const paymentWindow = windowStart || windowEndExclusive ? {
    ...(windowStart ? { gte: windowStart } : {}),
    ...(windowEndExclusive ? { lt: windowEndExclusive } : {}),
  } : undefined;
  const historyWindow = windowStart || windowEndExclusive ? {
    ...(windowStart ? { gte: windowStart } : {}),
    ...(windowEndExclusive ? { lt: windowEndExclusive } : {}),
  } : undefined;

  const [
    statusGroups, paymentsSum, paymentCount, paymentsByMethod, clientInvoiceGroups,
    clientPaidRows, outstandingRows, windowPaymentsSum, windowPaymentCount,
    issuedHistory, paymentsWithReference,
  ] = await Promise.all([
    prisma.corporateInvoice.groupBy({
      by: ['status'], where: { companyId },
      _count: { _all: true }, _sum: { totalPesewas: true },
    }),
    prisma.invoicePayment.aggregate({ where: { companyId }, _sum: { amountPesewas: true } }),
    prisma.invoicePayment.count({ where: { companyId } }),
    prisma.invoicePayment.groupBy({
      by: ['method'], where: { companyId },
      _count: { _all: true }, _sum: { amountPesewas: true },
    }),
    prisma.corporateInvoice.groupBy({
      by: ['clientId'], where: { companyId, status: { in: ['ISSUED', 'PAID'] } },
      _count: { _all: true }, _sum: { totalPesewas: true },
    }),
    prisma.$queryRaw<Array<{ clientId: string; paidPesewas: bigint }>>`
      SELECT i."clientId" AS "clientId", COALESCE(SUM(p."amountPesewas"), 0) AS "paidPesewas"
      FROM "InvoicePayment" p
      INNER JOIN "CorporateInvoice" i
        ON i."companyId" = p."companyId" AND i."id" = p."invoiceId"
      WHERE p."companyId" = ${companyId}
      GROUP BY i."clientId"
    `,
    prisma.$queryRaw<Array<{ outstandingPesewas: bigint }>>`
      SELECT COALESCE(SUM(i."totalPesewas" - COALESCE(p."paidPesewas", 0)), 0) AS "outstandingPesewas"
      FROM "CorporateInvoice" i
      LEFT JOIN (
        SELECT "invoiceId", SUM("amountPesewas") AS "paidPesewas"
        FROM "InvoicePayment"
        WHERE "companyId" = ${companyId}
        GROUP BY "invoiceId"
      ) p ON p."invoiceId" = i."id"
      WHERE i."companyId" = ${companyId} AND i."status" = 'ISSUED'
    `,
    prisma.invoicePayment.aggregate({
      where: { companyId, ...(paymentWindow ? { receivedAt: paymentWindow } : {}) },
      _sum: { amountPesewas: true },
    }),
    prisma.invoicePayment.count({
      where: { companyId, ...(paymentWindow ? { receivedAt: paymentWindow } : {}) },
    }),
    prisma.corporateInvoiceStatusHistory.findMany({
      where: {
        companyId, toStatus: 'ISSUED',
        ...(historyWindow ? { createdAt: historyWindow } : {}),
      },
      select: { invoiceId: true },
    }),
    prisma.invoicePayment.count({ where: { companyId, reference: { not: null } } }),
  ]);

  const issuedInvoiceIds = [...new Set(issuedHistory.map((row: { invoiceId: string }) => row.invoiceId))];
  const [issuedInWindowSum, issuedInWindowCount, standingIssuedCount, standingWithTimestamp] = await Promise.all([
    issuedInvoiceIds.length > 0
      ? prisma.corporateInvoice.aggregate({
        where: { companyId, id: { in: issuedInvoiceIds }, status: { not: 'VOID' } },
        _sum: { totalPesewas: true },
      })
      : Promise.resolve({ _sum: { totalPesewas: null } }),
    issuedInvoiceIds.length > 0
      ? prisma.corporateInvoice.count({
        where: { companyId, id: { in: issuedInvoiceIds }, status: { not: 'VOID' } },
      })
      : Promise.resolve(0),
    prisma.corporateInvoice.count({ where: { companyId, status: { in: ['ISSUED', 'PAID'] } } }),
    prisma.corporateInvoiceStatusHistory.count({
      where: { companyId, toStatus: 'ISSUED', invoice: { status: { in: ['ISSUED', 'PAID'] } } },
    }),
  ]);

  const paidByClient = new Map(clientPaidRows.map((row) => [row.clientId, Number(row.paidPesewas)]));
  const invoicedByClient = new Map(clientInvoiceGroups.map((row: {
    clientId: string; _count: { _all: number }; _sum: { totalPesewas: number | null };
  }) => [row.clientId, row]));
  const clientIds = [...new Set([...invoicedByClient.keys(), ...paidByClient.keys()])];
  const clientRows = clientIds.length > 0
    ? await prisma.client.findMany({
      where: { companyId, id: { in: clientIds } }, select: { id: true, name: true },
    })
    : [];
  const clientNames = new Map(clientRows.map((client: { id: string; name: string }) => [client.id, client.name]));

  const summary = summariseFinanceDashboard({
    statusTotals: statusGroups.map((row: {
      status: string; _count: { _all: number }; _sum: { totalPesewas: number | null };
    }) => ({
      status: row.status,
      invoiceCount: row._count._all,
      totalPesewas: row._sum.totalPesewas ?? 0,
    })),
    totalPaymentsPesewas: paymentsSum._sum.amountPesewas ?? 0,
    outstandingPesewas: Number(outstandingRows[0]?.outstandingPesewas ?? BigInt(0)),
    clients: clientIds.map((clientId) => ({
      clientId,
      clientName: clientNames.get(clientId) ?? 'Unknown client',
      standingInvoiceCount: invoicedByClient.get(clientId)?._count._all ?? 0,
      invoicedPesewas: invoicedByClient.get(clientId)?._sum.totalPesewas ?? 0,
      paidPesewas: paidByClient.get(clientId) ?? 0,
    })),
  });

  const methodRows = paymentsByMethod.map((row: {
    method: string | null; _count: { _all: number }; _sum: { amountPesewas: number | null };
  }) => ({
    method: row.method ?? 'Not recorded',
    paymentCount: row._count._all,
    amountPesewas: row._sum.amountPesewas ?? 0,
  })).sort((a, b) => (b.amountPesewas - a.amountPesewas) || a.method.localeCompare(b.method));
  const paymentsWithMethod = methodRows
    .filter((row) => row.method !== 'Not recorded')
    .reduce((sum, row) => sum + row.paymentCount, 0);

  return {
    generatedAt: new Date().toISOString(),
    window: { fromDate: query.fromDate ?? null, toDate: query.toDate ?? null },
    recognizedRevenuePesewas: summary.recognizedRevenuePesewas,
    paymentsReceivedPesewas: summary.paymentsReceivedPesewas,
    outstandingPesewas: summary.outstandingPesewas,
    draftPipelinePesewas: summary.draftPipelinePesewas,
    draftInvoiceCount: summary.draftInvoiceCount,
    voidedInvoiceCount: summary.voidedInvoiceCount,
    voidedTotalPesewas: summary.voidedTotalPesewas,
    countsByStatus: summary.countsByStatus,
    clients: summary.clients,
    paymentsByMethod: methodRows,
    activity: {
      paymentsReceivedPesewas: windowPaymentsSum._sum.amountPesewas ?? 0,
      paymentCount: windowPaymentCount,
      invoicesIssuedCount: issuedInWindowCount,
      revenueRecognizedPesewas: issuedInWindowSum._sum.totalPesewas ?? 0,
    },
    coverage: {
      issuedInvoicesWithTimestamp: { numerator: standingWithTimestamp, denominator: standingIssuedCount },
      paymentsWithMethod: { numerator: paymentsWithMethod, denominator: paymentCount },
      paymentsWithReference: { numerator: paymentsWithReference, denominator: paymentCount },
    },
    reconciliation: summary.reconciliation,
    margin: {
      status: 'INSUFFICIENT_DATA',
      reason: 'Attributable cost records (FIN-05 expenses, Phase 3) do not exist yet, so margin is not shown.',
    },
    unavailableMetrics: UNAVAILABLE_METRICS,
  };
}
