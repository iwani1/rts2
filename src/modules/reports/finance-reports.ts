import { z } from 'zod';
import { getPrisma } from '@/server/prisma';
import { getFinanceDashboard } from '../finance/dashboard';
import type { DashboardMargin } from '../finance/dashboard-summary';
import { reportQuerySchema, reportWindow, type ReportQuery } from './report-schema';
import { assertReportAccess, FINANCE_SCOPES } from './transport-reports';

const companyIdSchema = z.string().trim().min(1).max(128);
const OUTSTANDING_LIST_CAP = 100;

export type FinanceReport = {
  generatedAt: string;
  window: { fromDate: string | null; toDate: string | null };
  clientId: string | null;
  totals: {
    recognizedRevenuePesewas: number;
    paymentsReceivedPesewas: number;
    outstandingPesewas: number;
    reconciles: boolean;
  };
  revenueByClient: Array<{ clientId: string; clientName: string; invoiceCount: number; revenuePesewas: number }>;
  revenueByService: Array<{ serviceType: string; invoiceCount: number; revenuePesewas: number }>;
  paymentsInWindow: {
    totalPesewas: number;
    paymentCount: number;
    byMethod: Array<{ method: string; paymentCount: number; amountPesewas: number }>;
  };
  outstandingInvoices: {
    totalCount: number;
    totalOutstandingPesewas: number;
    listedCount: number;
    invoices: Array<{
      reference: string; clientName: string; periodStart: string; periodEnd: string;
      totalPesewas: number; paidPesewas: number; outstandingPesewas: number;
    }>;
  };
  coverage: {
    issuedInvoicesWithTimestamp: { numerator: number; denominator: number };
    paymentsWithMethod: { numerator: number; denominator: number };
    paymentsWithReference: { numerator: number; denominator: number };
  };
  margin: DashboardMargin;
  unavailableMetrics: Array<{ metric: string; reason: string }>;
};

/**
 * RPT-03 / D-064: financial report. Headline totals are the FIN-07 dashboard's
 * reconciled figures (D-063); this report adds the windowed breakdowns —
 * revenue by client and by contract service type (standing invoices by their
 * ISSUED history timestamp), payments received in the window by method — and
 * the point-in-time outstanding-invoice list. The dashboard's estimated
 * gross margin (approved FIN-05 expenses, D-082) passes through unchanged.
 */
export async function getFinanceReport(input: {
  actorId: string; companyId: string;
} & ReportQuery): Promise<FinanceReport> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = reportQuerySchema.parse({
    fromDate: input.fromDate, toDate: input.toDate, clientId: input.clientId,
    routeId: input.routeId, driverId: input.driverId, vehicleId: input.vehicleId,
    serviceType: input.serviceType, status: input.status,
  });
  await assertReportAccess(input.actorId, companyId, FINANCE_SCOPES);
  const prisma = getPrisma();
  const window = reportWindow(query);
  const dashboard = await getFinanceDashboard({
    actorId: input.actorId, companyId, fromDate: query.fromDate, toDate: query.toDate,
  });

  const paymentWindowFilter = window.start || window.endExclusive ? {
    ...(window.start ? { gte: window.start } : {}),
    ...(window.endExclusive ? { lt: window.endExclusive } : {}),
  } : undefined;
  const historyWindowFilter = window.start || window.endExclusive ? {
    ...(window.start ? { gte: window.start } : {}),
    ...(window.endExclusive ? { lt: window.endExclusive } : {}),
  } : undefined;

  const [issuedHistory, paymentsSum, paymentsCount, paymentsByMethod, issuedInvoices] = await Promise.all([
    prisma.corporateInvoiceStatusHistory.findMany({
      where: {
        companyId, toStatus: 'ISSUED',
        ...(historyWindowFilter ? { createdAt: historyWindowFilter } : {}),
        ...(query.clientId ? { invoice: { clientId: query.clientId } } : {}),
      },
      select: { invoiceId: true },
    }),
    prisma.invoicePayment.aggregate({
      where: {
        companyId,
        ...(paymentWindowFilter ? { receivedAt: paymentWindowFilter } : {}),
        ...(query.clientId ? { invoice: { clientId: query.clientId } } : {}),
      },
      _sum: { amountPesewas: true },
    }),
    prisma.invoicePayment.count({
      where: {
        companyId,
        ...(paymentWindowFilter ? { receivedAt: paymentWindowFilter } : {}),
        ...(query.clientId ? { invoice: { clientId: query.clientId } } : {}),
      },
    }),
    prisma.invoicePayment.groupBy({
      by: ['method'],
      where: {
        companyId,
        ...(paymentWindowFilter ? { receivedAt: paymentWindowFilter } : {}),
        ...(query.clientId ? { invoice: { clientId: query.clientId } } : {}),
      },
      _count: { _all: true }, _sum: { amountPesewas: true },
    }),
    prisma.corporateInvoice.findMany({
      where: { companyId, status: 'ISSUED', ...(query.clientId ? { clientId: query.clientId } : {}) },
      select: {
        reference: true, periodStart: true, periodEnd: true, totalPesewas: true,
        client: { select: { name: true } },
        payments: { select: { amountPesewas: true } },
      },
    }),
  ]);

  const issuedIds = [...new Set(issuedHistory.map((row: { invoiceId: string }) => row.invoiceId))];
  const recognised = issuedIds.length > 0
    ? await prisma.corporateInvoice.findMany({
      where: {
        companyId, id: { in: issuedIds }, status: { not: 'VOID' },
        ...(query.clientId ? { clientId: query.clientId } : {}),
      },
      select: {
        clientId: true, totalPesewas: true,
        client: { select: { name: true } },
        contract: { select: { serviceType: true } },
      },
    })
    : [];

  const clientMap = new Map<string, { clientId: string; clientName: string; invoiceCount: number; revenuePesewas: number }>();
  const serviceMap = new Map<string, { serviceType: string; invoiceCount: number; revenuePesewas: number }>();
  for (const invoice of recognised as Array<{
    clientId: string; totalPesewas: number;
    client: { name: string }; contract: { serviceType: string | null };
  }>) {
    const client = clientMap.get(invoice.clientId) ?? {
      clientId: invoice.clientId, clientName: invoice.client.name, invoiceCount: 0, revenuePesewas: 0,
    };
    client.invoiceCount += 1;
    client.revenuePesewas += invoice.totalPesewas;
    clientMap.set(invoice.clientId, client);
    const serviceType = invoice.contract.serviceType ?? 'Service not recorded';
    const service = serviceMap.get(serviceType) ?? { serviceType, invoiceCount: 0, revenuePesewas: 0 };
    service.invoiceCount += 1;
    service.revenuePesewas += invoice.totalPesewas;
    serviceMap.set(serviceType, service);
  }

  const outstandingRows = (issuedInvoices as Array<{
    reference: string; periodStart: Date; periodEnd: Date; totalPesewas: number;
    client: { name: string }; payments: Array<{ amountPesewas: number }>;
  }>).map((invoice) => {
    const paidPesewas = invoice.payments.reduce((sum, payment) => sum + payment.amountPesewas, 0);
    return {
      reference: invoice.reference,
      clientName: invoice.client.name,
      periodStart: invoice.periodStart.toISOString().slice(0, 10),
      periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
      totalPesewas: invoice.totalPesewas,
      paidPesewas,
      outstandingPesewas: invoice.totalPesewas - paidPesewas,
    };
  }).filter((row) => row.outstandingPesewas > 0)
    .sort((a, b) => b.outstandingPesewas - a.outstandingPesewas || a.reference.localeCompare(b.reference));

  return {
    generatedAt: new Date().toISOString(),
    window: { fromDate: query.fromDate ?? null, toDate: query.toDate ?? null },
    clientId: query.clientId ?? null,
    totals: {
      recognizedRevenuePesewas: dashboard.recognizedRevenuePesewas,
      paymentsReceivedPesewas: dashboard.paymentsReceivedPesewas,
      outstandingPesewas: dashboard.outstandingPesewas,
      reconciles: dashboard.reconciliation.reconciles,
    },
    revenueByClient: [...clientMap.values()]
      .sort((a, b) => b.revenuePesewas - a.revenuePesewas || a.clientName.localeCompare(b.clientName)),
    revenueByService: [...serviceMap.values()]
      .sort((a, b) => b.revenuePesewas - a.revenuePesewas || a.serviceType.localeCompare(b.serviceType)),
    paymentsInWindow: {
      totalPesewas: paymentsSum._sum.amountPesewas ?? 0,
      paymentCount: paymentsCount,
      byMethod: (paymentsByMethod as Array<{
        method: string | null; _count: { _all: number }; _sum: { amountPesewas: number | null };
      }>).map((row) => ({
        method: row.method ?? 'Not recorded',
        paymentCount: row._count._all,
        amountPesewas: row._sum.amountPesewas ?? 0,
      })).sort((a, b) => b.amountPesewas - a.amountPesewas || a.method.localeCompare(b.method)),
    },
    outstandingInvoices: {
      totalCount: outstandingRows.length,
      totalOutstandingPesewas: outstandingRows.reduce((sum, row) => sum + row.outstandingPesewas, 0),
      listedCount: Math.min(outstandingRows.length, OUTSTANDING_LIST_CAP),
      invoices: outstandingRows.slice(0, OUTSTANDING_LIST_CAP),
    },
    coverage: dashboard.coverage,
    margin: dashboard.margin,
    unavailableMetrics: dashboard.unavailableMetrics.filter(
      (item) => item.metric !== 'Outstanding ageing by due date',
    ),
  };
}
