import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { financeDashboardQuerySchema } from './dashboard-schema';
import {
  summariseCostsAndMargin,
  summariseFinanceDashboard,
  summariseInvoiceAgeing,
  type InvoiceAgeingBucket,
  type DashboardMargin,
  type ExpenseCategoryTotal,
  type TripCost,
} from './dashboard-summary';

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
  expenses: {
    byCategory: ExpenseCategoryTotal[];
    approvedPesewas: number;
    approvedCount: number;
    pendingPesewas: number;
    pendingCount: number;
    tripCosts: TripCost[];
  };
  ageing: {
    asOfDate: string;
    buckets: InvoiceAgeingBucket[];
    undated: { invoiceCount: number; outstandingPesewas: number };
  };
  margin: DashboardMargin;
  unavailableMetrics: Array<{ metric: string; reason: string }>;
};

const UNAVAILABLE_METRICS = [
  {
    metric: 'Rental revenue in the headline totals',
    reason: 'Headline revenue and the reconciliation tie-out remain corporate (FIN-07 / D-063). Rental invoices are aged in the ageing section; no rental-revenue recognition rule has been defined yet.',
  },
];

/**
 * FIN-07 / D-063: read-only finance dashboard whose totals reconcile to the
 * corporate invoice and payment transaction records. Revenue counts ISSUED +
 * PAID invoices only, payments are the append-only InvoicePayment sums, and
 * outstanding is derived per invoice — never stored. The optional window
 * drives the activity section (payments by receivedAt, recognition by
 * the append-only ISSUED history timestamp); balances are point-in-time.
 * Approved FIN-05 expenses are the attributable cost basis for expenses by
 * category, cost per completed trip/passenger and the estimated gross margin
 * on a matched window/all-time basis (D-082).
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

  // FIN-05R / D-082: approved expenses are the attributable cost basis, on
  // the expense date within the selected window when one is given.
  const expenseWindow = windowStart || windowEndExclusive ? {
    expenseDate: {
      ...(windowStart ? { gte: windowStart } : {}),
      ...(windowEndExclusive ? { lt: windowEndExclusive } : {}),
    },
  } : {};
  const [approvedByCategoryRows, pendingAggregate, approvedTripCostRows] = await Promise.all([
    prisma.expense.groupBy({
      by: ['category'], where: { companyId, status: 'Approved', ...expenseWindow },
      _count: { _all: true }, _sum: { amountPesewas: true },
    }),
    prisma.expense.aggregate({
      where: { companyId, status: 'Pending', ...expenseWindow },
      _count: { _all: true }, _sum: { amountPesewas: true },
    }),
    prisma.expense.groupBy({
      by: ['tripId'], where: { companyId, status: 'Approved', tripId: { not: null }, ...expenseWindow },
      _sum: { amountPesewas: true },
    }),
  ]);
  const tripCostTripIds = approvedTripCostRows
    .map((row) => row.tripId)
    .filter((tripId): tripId is string => Boolean(tripId));
  const [completedTrips, completedJourneyRows] = tripCostTripIds.length > 0
    ? await Promise.all([
        prisma.trip.findMany({
          where: { companyId, id: { in: tripCostTripIds }, status: 'Completed' },
          select: { id: true, tripDate: true },
        }),
        prisma.booking.groupBy({
          by: ['tripId'],
          where: { companyId, tripId: { in: tripCostTripIds }, status: 'Completed' },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const completedTripDates = new Map(completedTrips.map((trip) => [trip.id, trip.tripDate]));
  const journeysByTrip = new Map(
    completedJourneyRows.map((row) => [row.tripId, row._count._all]),
  );
  const hasWindow = Boolean(query.fromDate || query.toDate);
  const costs = summariseCostsAndMargin({
    approvedByCategory: approvedByCategoryRows.map((row) => ({
      category: row.category,
      expenseCount: row._count._all,
      amountPesewas: row._sum.amountPesewas ?? 0,
    })).sort((a, b) => b.amountPesewas - a.amountPesewas || a.category.localeCompare(b.category)),
    pendingCount: pendingAggregate._count._all,
    pendingPesewas: pendingAggregate._sum.amountPesewas ?? 0,
    tripCosts: approvedTripCostRows
      .filter((row) => row.tripId && completedTripDates.has(row.tripId))
      .map((row) => ({
        tripId: row.tripId as string,
        tripDate: (completedTripDates.get(row.tripId as string) as Date).toISOString().slice(0, 10),
        approvedCostPesewas: row._sum.amountPesewas ?? 0,
        completedJourneys: journeysByTrip.get(row.tripId as string) ?? 0,
      }))
      .sort((a, b) => b.approvedCostPesewas - a.approvedCostPesewas),
    revenuePesewas: hasWindow
      ? (issuedInWindowSum._sum.totalPesewas ?? 0)
      : summary.recognizedRevenuePesewas,
    basis: hasWindow ? 'window' : 'all-time',
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

  // D-090/5C: ageing over ISSUED invoices of both kinds, point-in-time
  // (the dashboard window does not apply). Outstanding derives from the
  // append-only payment records per invoice; undated invoices are counted
  // separately by the summariser, never folded into the buckets.
  const asOfDate = new Date().toISOString().slice(0, 10);
  const [corporateAgeingRows, rentalAgeingRows] = await Promise.all([
    prisma.$queryRaw<Array<{ dueDate: Date | null; outstandingPesewas: bigint }>>`
      SELECT i."dueDate" AS "dueDate",
        (i."totalPesewas" - COALESCE(p."paidPesewas", 0)) AS "outstandingPesewas"
      FROM "CorporateInvoice" i
      LEFT JOIN (
        SELECT "invoiceId", SUM("amountPesewas") AS "paidPesewas"
        FROM "InvoicePayment" WHERE "companyId" = ${companyId} GROUP BY "invoiceId"
      ) p ON p."invoiceId" = i."id"
      WHERE i."companyId" = ${companyId} AND i."status" = 'ISSUED'
    `,
    prisma.$queryRaw<Array<{ dueDate: Date | null; outstandingPesewas: bigint }>>`
      SELECT i."dueDate" AS "dueDate",
        (i."totalPesewas" - COALESCE(p."paidPesewas", 0)) AS "outstandingPesewas"
      FROM "RentalInvoice" i
      LEFT JOIN (
        SELECT "invoiceId", SUM("amountPesewas") AS "paidPesewas"
        FROM "RentalInvoicePayment" WHERE "companyId" = ${companyId} GROUP BY "invoiceId"
      ) p ON p."invoiceId" = i."id"
      WHERE i."companyId" = ${companyId} AND i."status" = 'ISSUED'
    `,
  ]);
  const ageing = summariseInvoiceAgeing([
    ...corporateAgeingRows.map((row) => ({
      kind: 'CORPORATE' as const,
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      outstandingPesewas: Number(row.outstandingPesewas),
    })),
    ...rentalAgeingRows.map((row) => ({
      kind: 'RENTAL' as const,
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      outstandingPesewas: Number(row.outstandingPesewas),
    })),
  ], asOfDate);

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
    expenses: {
      byCategory: approvedByCategoryRows.map((row) => ({
        category: row.category,
        expenseCount: row._count._all,
        amountPesewas: row._sum.amountPesewas ?? 0,
      })).sort((a, b) => b.amountPesewas - a.amountPesewas || a.category.localeCompare(b.category)),
      approvedPesewas: costs.approvedExpensesPesewas,
      approvedCount: costs.approvedExpenseCount,
      pendingPesewas: pendingAggregate._sum.amountPesewas ?? 0,
      pendingCount: pendingAggregate._count._all,
      tripCosts: costs.tripCosts,
    },
    margin: costs.margin,
    ageing,
    unavailableMetrics: UNAVAILABLE_METRICS,
  };
}
