import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { summariseMaintenanceCosts } from './cost-analytics-summary';

export class MaintenanceAnalyticsCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'MaintenanceAnalyticsCompanyNotFoundError'; }
}

const querySchema = z.object({
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
}).refine((data) => !data.fromDate || !data.toDate || data.fromDate <= data.toDate, {
  message: 'The window end must not precede its start.',
}).refine((data) => {
  if (!data.fromDate || !data.toDate) return true;
  const days = (new Date(`${data.toDate}T00:00:00Z`).getTime() - new Date(`${data.fromDate}T00:00:00Z`).getTime()) / 86_400_000;
  return days <= 366;
}, { message: 'The window may span at most 366 days.' });

const OPEN_STATUSES = ['Reported', 'Awaiting Inspection', 'Approved', 'In Progress', 'Awaiting Parts', 'Awaiting Review'];

function turnaroundDays(dateReported: Date, completionDate: Date | null): number | null {
  if (!completionDate) return null;
  const reported = Date.UTC(dateReported.getUTCFullYear(), dateReported.getUTCMonth(), dateReported.getUTCDate());
  const completed = Date.UTC(completionDate.getUTCFullYear(), completionDate.getUTCMonth(), completionDate.getUTCDate());
  return Math.max(0, Math.round((completed - reported) / 86_400_000));
}

/**
 * MNT-04 / D-083: maintenance cost analytics over recorded work-order data
 * only. Spend covers finished (Completed/Closed) work orders by completion
 * date; recurring faults are counted by report date; open work orders are
 * shown as an ageing backlog. Nothing is imputed.
 */
export async function getMaintenanceCostAnalytics(input: {
  actorId: string; companyId: string; fromDate?: string; toDate?: string;
}) {
  const query = querySchema.parse({ fromDate: input.fromDate, toDate: input.toDate });
  const permission = await resolvePermission({
    userId: input.actorId, companyId: input.companyId, permission: 'maintenance:manage',
  });
  if (!permission.allowed || permission.scopes.length === 0) throw new PermissionDeniedError();
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: input.companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new MaintenanceAnalyticsCompanyNotFoundError();

  const windowStart = query.fromDate ? new Date(`${query.fromDate}T00:00:00.000Z`) : undefined;
  const windowEndExclusive = query.toDate
    ? new Date(new Date(`${query.toDate}T00:00:00.000Z`).getTime() + 86_400_000)
    : undefined;

  const [finishedRows, reportedRows, openRows] = await Promise.all([
    prisma.maintenanceWorkOrder.findMany({
      where: {
        companyId: input.companyId,
        status: { in: ['Completed', 'Closed'] },
        completionDate: {
          not: null,
          ...(windowStart ? { gte: windowStart } : {}),
          ...(windowEndExclusive ? { lt: windowEndExclusive } : {}),
        },
      },
      select: {
        vehicleId: true, workType: true, dateReported: true, completionDate: true,
        labourCostPesewas: true, partsCostPesewas: true, otherCostPesewas: true,
        vehicle: { select: { registrationNumber: true } },
      },
    }),
    prisma.maintenanceWorkOrder.findMany({
      where: {
        companyId: input.companyId,
        ...(windowStart || windowEndExclusive ? {
          dateReported: {
            ...(windowStart ? { gte: windowStart } : {}),
            ...(windowEndExclusive ? { lt: windowEndExclusive } : {}),
          },
        } : {}),
      },
      select: {
        vehicleId: true, workType: true, reportedFault: true,
        vehicle: { select: { registrationNumber: true } },
      },
    }),
    prisma.maintenanceWorkOrder.findMany({
      where: { companyId: input.companyId, status: { in: OPEN_STATUSES } },
      orderBy: { dateReported: 'asc' },
      select: {
        reference: true, status: true, dateReported: true,
        vehicle: { select: { registrationNumber: true } },
      },
    }),
  ]);

  const summary = summariseMaintenanceCosts({
    finished: finishedRows.map((row) => ({
      vehicleId: row.vehicleId,
      registrationNumber: row.vehicle.registrationNumber,
      workType: row.workType,
      labourPesewas: row.labourCostPesewas === null ? null : Number(row.labourCostPesewas),
      partsPesewas: row.partsCostPesewas === null ? null : Number(row.partsCostPesewas),
      otherPesewas: row.otherCostPesewas === null ? null : Number(row.otherCostPesewas),
      turnaroundDays: turnaroundDays(row.dateReported, row.completionDate),
    })),
    reported: reportedRows.map((row) => ({
      vehicleId: row.vehicleId,
      registrationNumber: row.vehicle.registrationNumber,
      workType: row.workType,
      reportedFault: row.reportedFault,
    })),
  });

  const todayMs = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  return {
    generatedAt: new Date().toISOString(),
    window: { fromDate: query.fromDate ?? null, toDate: query.toDate ?? null },
    basis: {
      spend: 'Finished (Completed/Closed) work orders by completion date',
      recurring: 'All work orders by report date',
    },
    ...summary,
    openBacklog: {
      count: openRows.length,
      workOrders: openRows.map((row) => ({
        reference: row.reference,
        status: row.status,
        registrationNumber: row.vehicle.registrationNumber,
        dateReported: row.dateReported.toISOString().slice(0, 10),
        ageDays: Math.max(0, Math.round((todayMs - Date.UTC(
          row.dateReported.getUTCFullYear(), row.dateReported.getUTCMonth(), row.dateReported.getUTCDate(),
        )) / 86_400_000)),
      })),
    },
    unavailableMetrics: [
      {
        metric: 'True vehicle downtime / availability',
        reason: 'No out-of-service intervals are recorded; repair turnaround (report to completion) is shown instead and is not fleet availability.',
      },
      {
        metric: 'Fuel and mileage cost series',
        reason: 'No fuel transaction records exist; costs shown are recorded work-order labour, parts and other amounts only.',
      },
    ],
  };
}

export type MaintenanceCostAnalytics = Awaited<ReturnType<typeof getMaintenanceCostAnalytics>>;
