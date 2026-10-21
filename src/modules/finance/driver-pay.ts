import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import {
  computeDriverPayLine,
  payrollRunCsv,
  summarisePayrollLines,
  type DriverPayLine,
  type DriverPayMetrics,
  type PayrollTotals,
} from './driver-pay-computation';
import { isAllowedPayRuleTransition, isAllowedPayrollRunTransition } from './driver-pay-transitions';

export class DriverPayCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'DriverPayCompanyNotFoundError'; }
}
export class DriverPayNotFoundError extends Error {
  readonly code = 'DRIVER_PAY_NOT_FOUND';
  constructor(message = 'Pay record not found.') { super(message); this.name = 'DriverPayNotFoundError'; }
}
export class DriverPayPolicyError extends Error {
  readonly code = 'DRIVER_PAY_POLICY';
  readonly statusCode = 422;
  constructor(message: string) { super(message); this.name = 'DriverPayPolicyError'; }
}
export class DriverPayTransitionNotAllowedError extends Error {
  readonly code = 'DRIVER_PAY_TRANSITION_NOT_ALLOWED';
  readonly statusCode = 409;
  constructor(message: string) { super(message); this.name = 'DriverPayTransitionNotAllowedError'; }
}

const READ_SCOPES = ['GLOBAL', 'COMPANY', 'READ_ONLY'] as const;
const WRITE_SCOPES = ['GLOBAL', 'COMPANY'] as const;

async function requirePayAccess(actorId: string, companyId: string, scopes: readonly string[]) {
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'driver:pay' });
  if (!access.allowed || !access.scopes.some((scope) => scopes.includes(scope))) {
    throw new PermissionDeniedError();
  }
}

async function requireActiveCompany(companyId: string) {
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new DriverPayCompanyNotFoundError();
}

const idSchema = z.string().trim().min(1).max(128);
const reasonSchema = z.string().trim().min(8).max(500);

const createRuleSchema = z.object({
  actorId: idSchema,
  companyId: idSchema,
  name: z.string().trim().min(3).max(200),
  basis: z.enum(['PER_COMPLETED_TRIP', 'PER_BOARDING', 'FLAT_PER_DAY']),
  ratePesewas: z.number().int().positive().safe(),
  overtimeThresholdMinutesPerDay: z.number().int().positive().safe().nullable().optional(),
  overtimeRatePesewasPerHour: z.number().int().positive().safe().nullable().optional(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable().optional(),
  reason: reasonSchema,
}).strict().refine(
  (data) => (data.overtimeThresholdMinutesPerDay == null) === (data.overtimeRatePesewasPerHour == null),
  { message: 'Overtime threshold and overtime rate must be configured together.' },
).refine(
  (data) => !data.effectiveTo || data.effectiveTo >= data.effectiveFrom,
  { message: 'The effectivity end must not precede its start.' },
);

const transitionRuleSchema = z.object({
  actorId: idSchema, companyId: idSchema, ruleId: idSchema,
  toStatus: z.enum(['ACTIVE', 'RETIRED']), reason: reasonSchema,
}).strict();

const createRunSchema = z.object({
  actorId: idSchema, companyId: idSchema, ruleId: idSchema,
  periodStart: z.string().date(), periodEnd: z.string().date(), reason: reasonSchema,
}).strict().refine((data) => data.periodStart <= data.periodEnd, {
  message: 'The period end must not precede its start.',
});

const transitionRunSchema = z.object({
  actorId: idSchema, companyId: idSchema, runId: idSchema,
  toStatus: z.literal('FINAL'), reason: reasonSchema,
}).strict();

function historyInclude() {
  return {
    orderBy: { sequence: 'asc' as const }, take: 50,
    include: { actor: { select: { name: true } } },
  };
}

/** FIN-06 / D-086: draft a pay rule; it pays nobody until independently activated. */
export async function createPayRule(input: unknown) {
  const data = createRuleSchema.parse(input);
  await requirePayAccess(data.actorId, data.companyId, WRITE_SCOPES);
  await requireActiveCompany(data.companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const reference = `PAYRULE-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const rule = await tx.driverPayRule.create({
      data: {
        companyId: data.companyId, reference, name: data.name, basis: data.basis,
        ratePesewas: data.ratePesewas,
        overtimeThresholdMinutesPerDay: data.overtimeThresholdMinutesPerDay ?? null,
        overtimeRatePesewasPerHour: data.overtimeRatePesewasPerHour ?? null,
        effectiveFrom: new Date(`${data.effectiveFrom}T00:00:00.000Z`),
        effectiveTo: data.effectiveTo ? new Date(`${data.effectiveTo}T00:00:00.000Z`) : null,
        status: 'DRAFT', createdById: data.actorId,
      },
    });
    await tx.driverPayRuleStatusHistory.create({
      data: {
        companyId: data.companyId, ruleId: rule.id, sequence: 1,
        actorId: data.actorId, fromStatus: null, toStatus: 'DRAFT', reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId,
        action: 'PAY_RULE_DRAFTED', entityType: 'DRIVER_PAY_RULE', entityId: rule.id,
        summary: {
          reference, basis: data.basis, ratePesewas: data.ratePesewas,
          effectiveFrom: data.effectiveFrom, effectiveTo: data.effectiveTo ?? null, reason: data.reason,
        },
      },
    });
    return { id: rule.id, reference, status: rule.status };
  });
}

export async function transitionPayRule(input: unknown) {
  const data = transitionRuleSchema.parse(input);
  await requirePayAccess(data.actorId, data.companyId, WRITE_SCOPES);
  await requireActiveCompany(data.companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string; status: string; createdById: string; reference: string }>>`
      SELECT "id", "status", "createdById", "reference" FROM "DriverPayRule"
      WHERE "id" = ${data.ruleId} AND "companyId" = ${data.companyId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) throw new DriverPayNotFoundError('Pay rule not found.');
    if (!isAllowedPayRuleTransition(current.status, data.toStatus)) {
      throw new DriverPayTransitionNotAllowedError(`A pay rule cannot move from ${current.status} to ${data.toStatus}.`);
    }
    if (data.toStatus === 'ACTIVE' && data.actorId === current.createdById) {
      throw new DriverPayPolicyError('A different authorised user must activate a pay rule than the person who drafted it.');
    }
    const latest = await tx.driverPayRuleStatusHistory.findFirst({
      where: { companyId: data.companyId, ruleId: data.ruleId },
      orderBy: { sequence: 'desc' }, select: { sequence: true },
    });
    await tx.driverPayRule.update({ where: { id: data.ruleId }, data: { status: data.toStatus } });
    await tx.driverPayRuleStatusHistory.create({
      data: {
        companyId: data.companyId, ruleId: data.ruleId, sequence: (latest?.sequence ?? 0) + 1,
        actorId: data.actorId, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId,
        action: data.toStatus === 'ACTIVE' ? 'PAY_RULE_ACTIVATED' : 'PAY_RULE_RETIRED',
        entityType: 'DRIVER_PAY_RULE', entityId: data.ruleId,
        summary: { reference: current.reference, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason },
      },
    });
    return { id: data.ruleId, reference: current.reference, status: data.toStatus };
  });
}

export async function listPayRules(input: { actorId: string; companyId: string }) {
  await requirePayAccess(input.actorId, input.companyId, READ_SCOPES);
  const prisma = getPrisma();
  const rows = await prisma.driverPayRule.findMany({
    where: { companyId: input.companyId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { statusHistory: historyInclude() },
  });
  return {
    rules: rows.map((row) => ({
      id: row.id, reference: row.reference, name: row.name, basis: row.basis,
      ratePesewas: row.ratePesewas,
      overtimeThresholdMinutesPerDay: row.overtimeThresholdMinutesPerDay,
      overtimeRatePesewasPerHour: row.overtimeRatePesewasPerHour,
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
      status: row.status, createdById: row.createdById,
      statusHistory: row.statusHistory.map(({ actor, ...event }) => ({
        ...event, createdAt: event.createdAt.toISOString(), actorName: actor.name,
      })),
    })),
  };
}

type RuleRow = {
  id: string; status: string; basis: string; ratePesewas: number;
  overtimeThresholdMinutesPerDay: number | null; overtimeRatePesewasPerHour: number | null;
  effectiveFrom: Date; effectiveTo: Date | null;
};

async function computeLines(companyId: string, rule: RuleRow, periodStart: Date, periodEnd: Date) {
  const prisma = getPrisma();
  const periodEndExclusive = new Date(periodEnd.getTime() + 86_400_000);
  const trips = await prisma.trip.findMany({
    where: {
      companyId, status: 'Completed', driverId: { not: null },
      tripDate: { gte: periodStart, lt: periodEndExclusive },
    },
    select: { id: true, driverId: true, tripDate: true },
  });
  const tripIds = trips.map((trip) => trip.id);
  const [bookings, events, drivers] = await Promise.all([
    tripIds.length > 0
      ? prisma.booking.groupBy({
          by: ['tripId'],
          where: { companyId, tripId: { in: tripIds }, status: 'Completed' },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    tripIds.length > 0
      ? prisma.driverEvent.findMany({
          where: { companyId, tripId: { in: tripIds }, eventType: { in: ['START', 'COMPLETE'] } },
          select: { tripId: true, eventType: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    prisma.driver.findMany({ where: { companyId }, select: { id: true, fullName: true } }),
  ]);
  const boardingsByTrip = new Map(bookings.map((row) => [row.tripId, row._count._all]));
  const timingByTrip = new Map<string, { start?: number; complete?: number }>();
  for (const event of events) {
    const entry = timingByTrip.get(event.tripId) ?? {};
    if (event.eventType === 'START' && entry.start === undefined) entry.start = event.createdAt.getTime();
    if (event.eventType === 'COMPLETE') entry.complete = event.createdAt.getTime();
    timingByTrip.set(event.tripId, entry);
  }
  const names = new Map(drivers.map((driver) => [driver.id, driver.fullName]));
  const perDriver = new Map<string, {
    trips: Array<{ tripDate: Date }>;
    boardings: number;
    dayMinutes: Map<string, number>;
    tripsWithTiming: number;
    tripsWithoutTiming: number;
  }>();
  for (const trip of trips) {
    const driverId = trip.driverId as string;
    const day = trip.tripDate.toISOString().slice(0, 10);
    const bucket = perDriver.get(driverId) ?? {
      trips: [], boardings: 0, dayMinutes: new Map<string, number>(), tripsWithTiming: 0, tripsWithoutTiming: 0,
    };
    bucket.trips.push({ tripDate: trip.tripDate });
    bucket.boardings += boardingsByTrip.get(trip.id) ?? 0;
    const timing = timingByTrip.get(trip.id);
    if (timing?.start !== undefined && timing?.complete !== undefined && timing.complete >= timing.start) {
      bucket.dayMinutes.set(day, (bucket.dayMinutes.get(day) ?? 0) + Math.round((timing.complete - timing.start) / 60_000));
      bucket.tripsWithTiming += 1;
    } else {
      bucket.tripsWithoutTiming += 1;
    }
    perDriver.set(driverId, bucket);
  }
  const metrics: DriverPayMetrics[] = [...perDriver.entries()].map(([driverId, bucket]) => ({
    driverId,
    driverName: names.get(driverId) ?? 'Unknown driver',
    completedTrips: bucket.trips.length,
    boardings: bucket.boardings,
    activeDays: new Set(bucket.trips.map((trip) => trip.tripDate.toISOString().slice(0, 10))).size,
    timedDayMinutes: [...bucket.dayMinutes.values()],
    tripsWithTiming: bucket.tripsWithTiming,
    tripsWithoutTiming: bucket.tripsWithoutTiming,
  }));
  return metrics
    .map((metric) => computeDriverPayLine({
      basis: rule.basis as 'PER_COMPLETED_TRIP' | 'PER_BOARDING' | 'FLAT_PER_DAY',
      ratePesewas: rule.ratePesewas,
      overtimeThresholdMinutesPerDay: rule.overtimeThresholdMinutesPerDay,
      overtimeRatePesewasPerHour: rule.overtimeRatePesewasPerHour,
    }, metric))
    .sort((a, b) => b.totalPesewas - a.totalPesewas || a.driverName.localeCompare(b.driverName));
}

export async function createPayrollRun(input: unknown) {
  const data = createRunSchema.parse(input);
  await requirePayAccess(data.actorId, data.companyId, WRITE_SCOPES);
  await requireActiveCompany(data.companyId);
  const prisma = getPrisma();
  const rule = await prisma.driverPayRule.findFirst({
    where: { id: data.ruleId, companyId: data.companyId },
  });
  if (!rule) throw new DriverPayNotFoundError('Pay rule not found.');
  if (rule.status !== 'ACTIVE') {
    throw new DriverPayPolicyError('Payroll runs require an ACTIVE pay rule; draft or retired rules pay nobody.');
  }
  const periodStart = new Date(`${data.periodStart}T00:00:00.000Z`);
  const periodEnd = new Date(`${data.periodEnd}T00:00:00.000Z`);
  if (rule.effectiveFrom > periodEnd || (rule.effectiveTo !== null && rule.effectiveTo < periodStart)) {
    throw new DriverPayPolicyError('The pay rule is not effective for any part of this period.');
  }
  const lines = await computeLines(data.companyId, rule, periodStart, periodEnd);
  const totals = summarisePayrollLines(lines);
  return prisma.$transaction(async (tx) => {
    const reference = `PAYRUN-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const run = await tx.driverPayrollRun.create({
      data: {
        companyId: data.companyId, reference, ruleId: data.ruleId,
        periodStart, periodEnd, status: 'OPEN',
        lines: lines as never, totals: totals as never, createdById: data.actorId,
      },
    });
    await tx.driverPayrollRunStatusHistory.create({
      data: {
        companyId: data.companyId, runId: run.id, sequence: 1,
        actorId: data.actorId, fromStatus: null, toStatus: 'OPEN', reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId,
        action: 'PAYROLL_RUN_OPENED', entityType: 'DRIVER_PAYROLL_RUN', entityId: run.id,
        summary: {
          reference, ruleReference: rule.reference, periodStart: data.periodStart, periodEnd: data.periodEnd,
          drivers: totals.drivers, totalPesewas: totals.totalPesewas, reason: data.reason,
        },
      },
    });
    return { id: run.id, reference, status: 'OPEN' as const, lines, totals };
  });
}

export async function transitionPayrollRun(input: unknown) {
  const data = transitionRunSchema.parse(input);
  await requirePayAccess(data.actorId, data.companyId, WRITE_SCOPES);
  await requireActiveCompany(data.companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{
      id: string; status: string; createdById: string; reference: string;
      ruleId: string; periodStart: Date; periodEnd: Date;
    }>>`
      SELECT "id", "status", "createdById", "reference", "ruleId", "periodStart", "periodEnd" FROM "DriverPayrollRun"
      WHERE "id" = ${data.runId} AND "companyId" = ${data.companyId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) throw new DriverPayNotFoundError('Payroll run not found.');
    if (!isAllowedPayrollRunTransition(current.status, data.toStatus)) {
      throw new DriverPayTransitionNotAllowedError(`A payroll run cannot move from ${current.status} to ${data.toStatus}.`);
    }
    if (data.actorId === current.createdById) {
      throw new DriverPayPolicyError('A different authorised user must finalise a payroll run than the person who opened it.');
    }
    const rule = await tx.driverPayRule.findFirstOrThrow({ where: { id: current.ruleId, companyId: data.companyId } });
    // Recompute at finalisation: the stored snapshot is what was approved.
    const lines = await computeLines(data.companyId, rule, new Date(current.periodStart), new Date(current.periodEnd));
    const totals = summarisePayrollLines(lines);
    const latest = await tx.driverPayrollRunStatusHistory.findFirst({
      where: { companyId: data.companyId, runId: data.runId },
      orderBy: { sequence: 'desc' }, select: { sequence: true },
    });
    await tx.driverPayrollRun.update({
      where: { id: data.runId },
      data: { status: 'FINAL', lines: lines as never, totals: totals as never },
    });
    await tx.driverPayrollRunStatusHistory.create({
      data: {
        companyId: data.companyId, runId: data.runId, sequence: (latest?.sequence ?? 0) + 1,
        actorId: data.actorId, fromStatus: current.status, toStatus: 'FINAL', reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId,
        action: 'PAYROLL_RUN_FINALISED', entityType: 'DRIVER_PAYROLL_RUN', entityId: data.runId,
        summary: { reference: current.reference, drivers: totals.drivers, totalPesewas: totals.totalPesewas, reason: data.reason },
      },
    });
    return { id: data.runId, reference: current.reference, status: 'FINAL' as const, lines, totals };
  });
}

function runRecord(row: {
  id: string; reference: string; ruleId: string; periodStart: Date; periodEnd: Date;
  status: string; lines: unknown; totals: unknown; createdById: string; createdAt: Date;
  rule: { reference: string; name: string; basis: string };
  statusHistory: Array<{
    sequence: number; fromStatus: string | null; toStatus: string; reason: string;
    createdAt: Date; actor: { name: string };
  }>;
}) {
  return {
    id: row.id, reference: row.reference, ruleId: row.ruleId,
    ruleReference: row.rule.reference, ruleName: row.rule.name, ruleBasis: row.rule.basis,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    status: row.status,
    lines: row.lines as DriverPayLine[],
    totals: row.totals as PayrollTotals,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    statusHistory: row.statusHistory.map(({ actor, ...event }) => ({
      ...event, createdAt: event.createdAt.toISOString(), actorName: actor.name,
    })),
  };
}

const runInclude = {
  rule: { select: { reference: true, name: true, basis: true } },
  statusHistory: {
    orderBy: { sequence: 'asc' as const }, take: 50,
    include: { actor: { select: { name: true } } },
  },
};

export async function listPayrollRuns(input: { actorId: string; companyId: string }) {
  await requirePayAccess(input.actorId, input.companyId, READ_SCOPES);
  const prisma = getPrisma();
  const rows = await prisma.driverPayrollRun.findMany({
    where: { companyId: input.companyId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: runInclude,
  });
  return { runs: rows.map((row) => runRecord(row as never)) };
}

/** The export is the approved payroll: only FINAL runs can be exported. */
export async function getPayrollRunExport(input: { actorId: string; companyId: string; runId: string }) {
  await requirePayAccess(input.actorId, input.companyId, READ_SCOPES);
  const prisma = getPrisma();
  const row = await prisma.driverPayrollRun.findFirst({
    where: { id: input.runId, companyId: input.companyId },
    include: runInclude,
  });
  if (!row) throw new DriverPayNotFoundError('Payroll run not found.');
  if (row.status !== 'FINAL') {
    throw new DriverPayPolicyError('Only a FINAL (approved) payroll run can be exported.');
  }
  const record = runRecord(row as never);
  return { filename: `${record.reference}.csv`, csv: payrollRunCsv(record) };
}
