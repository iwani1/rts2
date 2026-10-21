import type { Prisma } from '@prisma/client';
import { getPrisma } from '@/server/prisma';
import { routeScheduleActiveSchema, routeScheduleCopySchema, routeScheduleRequestSchema } from './route-schema';
import { routeAccessFor, routeCompanyIdSchema, routeIdSchema } from './route-access';
import { RouteNotFoundError } from './routes';

export class RouteScheduleNotFoundError extends Error {
  readonly code = 'ROUTE_SCHEDULE_NOT_FOUND';
  constructor() { super('Route schedule not found.'); this.name = 'RouteScheduleNotFoundError'; }
}
export class RouteScheduleConflictError extends Error {
  readonly code = 'ROUTE_SCHEDULE_CONFLICT';
  constructor(readonly conflicts: string[]) {
    super(`This schedule conflicts with an existing active schedule: ${conflicts.join('; ')}.`);
    this.name = 'RouteScheduleConflictError';
  }
}

export type RouteScheduleRecord = {
  id: string;
  routeId: string;
  kind: string;
  daysOfWeek: string[];
  scheduleDate: string | null;
  shift: string | null;
  plannedStartTime: string | null;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RouteScheduleDbShape = Omit<RouteScheduleRecord, 'scheduleDate'> & { scheduleDate: Date | null };

function presentSchedule(row: RouteScheduleDbShape): RouteScheduleRecord {
  return {
    id: row.id,
    routeId: row.routeId,
    kind: row.kind,
    daysOfWeek: row.daysOfWeek,
    scheduleDate: row.scheduleDate?.toISOString().slice(0, 10) ?? null,
    shift: row.shift,
    plannedStartTime: row.plannedStartTime,
    active: row.active,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const WEEKDAY_BY_UTC_DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

type ScheduleShape = {
  kind: string;
  daysOfWeek: string[];
  scheduleDate: string | null;
  plannedStartTime: string | null;
};

function schedulesOverlap(a: ScheduleShape, b: ScheduleShape): boolean {
  if (!a.plannedStartTime || !b.plannedStartTime || a.plannedStartTime !== b.plannedStartTime) return false;
  if (a.kind === 'RECURRING' && b.kind === 'RECURRING') {
    return a.daysOfWeek.some((day) => b.daysOfWeek.includes(day));
  }
  if (a.kind === 'ONE_TIME' && b.kind === 'ONE_TIME') {
    return a.scheduleDate !== null && a.scheduleDate === b.scheduleDate;
  }
  const recurring = a.kind === 'RECURRING' ? a : b;
  const oneTime = a.kind === 'ONE_TIME' ? a : b;
  if (!oneTime.scheduleDate) return false;
  const weekday = WEEKDAY_BY_UTC_DAY[new Date(`${oneTime.scheduleDate}T00:00:00.000Z`).getUTCDay()];
  return recurring.daysOfWeek.includes(weekday);
}

function describeSchedule(schedule: ScheduleShape & { shift: string | null }): string {
  const when = schedule.kind === 'RECURRING'
    ? `every ${schedule.daysOfWeek.join(', ')}`
    : `on ${schedule.scheduleDate}`;
  return `${when} at ${schedule.plannedStartTime}${schedule.shift ? ` (${schedule.shift})` : ''}`;
}

async function assertNoConflict(
  tx: Prisma.TransactionClient, companyId: string, routeId: string, candidate: ScheduleShape, excludeScheduleId?: string,
) {
  const existing = await tx.routeSchedule.findMany({
    where: { companyId, routeId, active: true, ...(excludeScheduleId ? { id: { not: excludeScheduleId } } : {}) },
    select: { kind: true, daysOfWeek: true, scheduleDate: true, plannedStartTime: true, shift: true },
  });
  const conflicts = existing
    .filter((entry: { kind: string; daysOfWeek: string[]; scheduleDate: Date | null; plannedStartTime: string | null }) => schedulesOverlap(candidate, {
      kind: entry.kind,
      daysOfWeek: entry.daysOfWeek,
      scheduleDate: entry.scheduleDate?.toISOString().slice(0, 10) ?? null,
      plannedStartTime: entry.plannedStartTime,
    }))
    .map((entry: { kind: string; daysOfWeek: string[]; scheduleDate: Date | null; plannedStartTime: string | null; shift: string | null }) => describeSchedule({
      kind: entry.kind,
      daysOfWeek: entry.daysOfWeek,
      scheduleDate: entry.scheduleDate?.toISOString().slice(0, 10) ?? null,
      plannedStartTime: entry.plannedStartTime,
      shift: entry.shift,
    }));
  if (conflicts.length > 0) throw new RouteScheduleConflictError(conflicts);
}

export async function listRouteSchedules(input: { actorId: string; companyId: string; routeId: string }): Promise<{
  schedules: RouteScheduleRecord[]; canManage: boolean;
}> {
  const companyId = routeCompanyIdSchema.parse(input.companyId);
  const routeId = routeIdSchema.parse(input.routeId);
  const access = await routeAccessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const route = await prisma.route.findFirst({ where: { id: routeId, companyId, archivedAt: null }, select: { id: true } });
  if (!route) throw new RouteNotFoundError();
  const rows = await prisma.routeSchedule.findMany({
    where: { companyId, routeId },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
  return { schedules: rows.map((row: RouteScheduleDbShape) => presentSchedule(row)), canManage: access.canManage };
}

export async function createRouteSchedule(input: unknown, actorId: string, companyIdInput: string, routeIdInput: string) {
  const data = routeScheduleRequestSchema.parse(input);
  const companyId = routeCompanyIdSchema.parse(companyIdInput);
  const routeId = routeIdSchema.parse(routeIdInput);
  await routeAccessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const route = await tx.route.findFirst({
      where: { id: routeId, companyId, archivedAt: null }, select: { id: true, reference: true },
    });
    if (!route) throw new RouteNotFoundError();
    await assertNoConflict(tx, companyId, routeId, {
      kind: data.kind, daysOfWeek: data.daysOfWeek, scheduleDate: data.scheduleDate, plannedStartTime: data.plannedStartTime,
    });
    const schedule = await tx.routeSchedule.create({
      data: {
        companyId, routeId, kind: data.kind, daysOfWeek: data.daysOfWeek,
        scheduleDate: data.scheduleDate ? new Date(`${data.scheduleDate}T00:00:00.000Z`) : null,
        shift: data.shift || null, plannedStartTime: data.plannedStartTime, active: true, notes: data.notes || null,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'ROUTE_SCHEDULE_CREATED', entityType: 'ROUTE_SCHEDULE', entityId: schedule.id,
        summary: { routeReference: route.reference, kind: data.kind, reason: data.reason },
      },
    });
    return presentSchedule(schedule);
  });
}

/**
 * Copies a previous schedule as a template. The copy is conflict-checked
 * against every other active schedule for the route (including its source),
 * so the caller adjusts the date, days or start time when they clash.
 */
export async function copyRouteSchedule(input: unknown, actorId: string, companyIdInput: string, scheduleIdInput: string) {
  const data = routeScheduleCopySchema.parse(input);
  const companyId = routeCompanyIdSchema.parse(companyIdInput);
  const scheduleId = routeIdSchema.parse(scheduleIdInput);
  await routeAccessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const source = await tx.routeSchedule.findFirst({ where: { id: scheduleId, companyId } });
    if (!source) throw new RouteScheduleNotFoundError();
    const candidate: ScheduleShape = {
      kind: source.kind,
      daysOfWeek: source.daysOfWeek,
      scheduleDate: data.scheduleDate !== undefined
        ? data.scheduleDate
        : source.scheduleDate?.toISOString().slice(0, 10) ?? null,
      plannedStartTime: data.plannedStartTime !== undefined ? data.plannedStartTime : source.plannedStartTime,
    };
    if (candidate.kind === 'ONE_TIME' && !candidate.scheduleDate) {
      throw new RouteScheduleConflictError(['A one-time copy needs a schedule date.']);
    }
    if (candidate.kind === 'RECURRING' && candidate.scheduleDate) {
      throw new RouteScheduleConflictError(['A recurring copy must not carry a schedule date.']);
    }
    await assertNoConflict(tx, companyId, source.routeId, candidate);
    const schedule = await tx.routeSchedule.create({
      data: {
        companyId, routeId: source.routeId, kind: candidate.kind, daysOfWeek: candidate.daysOfWeek,
        scheduleDate: candidate.scheduleDate ? new Date(`${candidate.scheduleDate}T00:00:00.000Z`) : null,
        shift: data.shift !== undefined ? data.shift || null : source.shift,
        plannedStartTime: candidate.plannedStartTime, active: true, notes: source.notes,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'ROUTE_SCHEDULE_COPIED', entityType: 'ROUTE_SCHEDULE', entityId: schedule.id,
        summary: { copiedFromScheduleId: source.id, routeId: source.routeId, reason: data.reason },
      },
    });
    return presentSchedule(schedule);
  });
}

export async function setRouteScheduleActive(input: unknown, actorId: string, companyIdInput: string, scheduleIdInput: string) {
  const data = routeScheduleActiveSchema.parse(input);
  const companyId = routeCompanyIdSchema.parse(companyIdInput);
  const scheduleId = routeIdSchema.parse(scheduleIdInput);
  await routeAccessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const current = await tx.routeSchedule.findFirst({ where: { id: scheduleId, companyId } });
    if (!current) throw new RouteScheduleNotFoundError();
    if (data.active && !current.active) {
      await assertNoConflict(tx, companyId, current.routeId, {
        kind: current.kind,
        daysOfWeek: current.daysOfWeek,
        scheduleDate: current.scheduleDate?.toISOString().slice(0, 10) ?? null,
        plannedStartTime: current.plannedStartTime,
      }, scheduleId);
    }
    const schedule = await tx.routeSchedule.update({
      where: { id: scheduleId },
      data: { active: data.active },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'ROUTE_SCHEDULE_ACTIVE_CHANGED', entityType: 'ROUTE_SCHEDULE', entityId: scheduleId,
        summary: { active: data.active, routeId: current.routeId, reason: data.reason },
      },
    });
    return presentSchedule(schedule);
  });
}
