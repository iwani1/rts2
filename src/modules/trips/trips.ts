import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import {
  bookingAssignedNotification,
  notifyLinkedEmployee,
} from '@/modules/notifications/notifications';
import {
  tripAssignBookingSchema,
  tripGenerateSchema,
  tripListQuerySchema,
  tripRequestSchema,
  tripTransitionSchema,
  tripUnassignBookingSchema,
} from './trip-schema';
import { isAllowedTripTransition } from './trip-transitions';

const companyIdSchema = z.string().trim().min(1).max(128);
const tripIdSchema = z.string().trim().min(1).max(128);
const MANIFEST_STATUSES = ['Assigned', 'Boarded', 'Completed'];

export class TripCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'TripCompanyNotFoundError'; }
}
export class TripNotFoundError extends Error {
  readonly code = 'TRIP_NOT_FOUND';
  constructor() { super('Trip not found.'); this.name = 'TripNotFoundError'; }
}
export class InvalidTripCursorError extends Error {
  readonly code = 'INVALID_TRIP_CURSOR';
  constructor() { super('Invalid trip cursor.'); this.name = 'InvalidTripCursorError'; }
}
export class TripValidationError extends Error {
  readonly code = 'TRIP_VALIDATION';
  constructor(message: string) { super(message); this.name = 'TripValidationError'; }
}
export class TripCapacityError extends Error {
  readonly code = 'TRIP_CAPACITY_EXCEEDED';
  constructor(limit: number) {
    super(`This trip is full (${limit} passenger(s)). Assign the booking to another trip or increase capacity first.`);
    this.name = 'TripCapacityError';
  }
}
export class TripTransitionNotAllowedError extends Error {
  readonly code = 'TRIP_TRANSITION_NOT_ALLOWED';
  constructor(readonly fromStatus: string, readonly toStatus: string) {
    super(`The transition from ${fromStatus} to ${toStatus} is not allowed.`);
    this.name = 'TripTransitionNotAllowedError';
  }
}
export class TripPolicyError extends Error {
  readonly code = 'TRIP_POLICY';
  constructor(message: string) { super(message); this.name = 'TripPolicyError'; }
}

export type TripStatusHistoryRecord = {
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  actorName: string;
  createdAt: Date;
};

export type TripRecord = {
  id: string;
  reference: string;
  clientId: string | null;
  clientName: string | null;
  routeId: string | null;
  routeName: string | null;
  scheduleId: string | null;
  serviceType: string | null;
  tripDate: string;
  plannedStartTime: string | null;
  plannedDurationMinutes: number | null;
  capacityLimit: number | null;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  driverId: string | null;
  driverName: string | null;
  status: string;
  passengerCount: number;
  delayReason: string | null;
  completionNotes: string | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TripDbShape = Omit<TripRecord, 'tripDate' | 'clientName' | 'routeName' | 'vehicleRegistration' | 'driverName' | 'passengerCount'> & {
  tripDate: Date;
  client: { name: string } | null;
  route: { name: string } | null;
  vehicle: { registrationNumber: string } | null;
  driver: { fullName: string } | null;
  _count: { bookings: number };
};

const tripInclude = {
  client: { select: { name: true } },
  route: { select: { name: true } },
  vehicle: { select: { registrationNumber: true } },
  driver: { select: { fullName: true } },
  _count: { select: { bookings: { where: { status: { in: [...MANIFEST_STATUSES] } } } } },
};

function presentTrip(row: TripDbShape): TripRecord {
  return {
    id: row.id,
    reference: row.reference,
    clientId: row.clientId,
    clientName: row.client?.name ?? null,
    routeId: row.routeId,
    routeName: row.route?.name ?? null,
    scheduleId: row.scheduleId,
    serviceType: row.serviceType,
    tripDate: row.tripDate.toISOString().slice(0, 10),
    plannedStartTime: row.plannedStartTime,
    plannedDurationMinutes: row.plannedDurationMinutes,
    capacityLimit: row.capacityLimit,
    vehicleId: row.vehicleId,
    vehicleRegistration: row.vehicle?.registrationNumber ?? null,
    driverId: row.driverId,
    driverName: row.driver?.fullName ?? null,
    status: row.status,
    passengerCount: row._count.bookings,
    delayReason: row.delayReason,
    completionNotes: row.completionNotes,
    actualStartAt: row.actualStartAt,
    actualEndAt: row.actualEndAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'trip:dispatch' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new TripCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

export async function listTrips(input: {
  actorId: string; companyId: string; status?: string; clientId?: string; routeId?: string;
  driverId?: string; date?: string; fromDate?: string; toDate?: string; cursor?: string;
}): Promise<{ trips: TripRecord[]; nextCursor: string | null; canManage: boolean }> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = tripListQuerySchema.parse({
    status: input.status || undefined, clientId: input.clientId || undefined, routeId: input.routeId || undefined,
    driverId: input.driverId || undefined, date: input.date || undefined,
    fromDate: input.fromDate || undefined, toDate: input.toDate || undefined, cursor: input.cursor,
  });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorTrip = await prisma.trip.findFirst({ where: { id: query.cursor, companyId }, select: { id: true } });
    if (!cursorTrip) throw new InvalidTripCursorError();
  }
  const rows = await prisma.trip.findMany({
    where: {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.routeId ? { routeId: query.routeId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.date ? { tripDate: new Date(`${query.date}T00:00:00.000Z`) } : {}),
      ...(!query.date && (query.fromDate || query.toDate) ? {
        tripDate: {
          ...(query.fromDate ? { gte: new Date(`${query.fromDate}T00:00:00.000Z`) } : {}),
          ...(query.toDate ? { lte: new Date(`${query.toDate}T00:00:00.000Z`) } : {}),
        },
      } : {}),
    },
    include: tripInclude,
    orderBy: [{ tripDate: 'asc' }, { plannedStartTime: 'asc' }, { id: 'asc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const trips = rows.slice(0, 50).map((row: TripDbShape) => presentTrip(row));
  return { trips, nextCursor: rows.length > 50 ? trips.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getTrip(input: { actorId: string; companyId: string; tripId: string }): Promise<{
  trip: TripRecord; canManage: boolean; history: TripStatusHistoryRecord[];
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const tripId = tripIdSchema.parse(input.tripId);
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const row = await prisma.trip.findFirst({
    where: { id: tripId, companyId },
    include: {
      ...tripInclude,
      statusHistory: { orderBy: { sequence: 'desc' }, take: 50, include: { actor: { select: { name: true } } } },
    },
  });
  if (!row) throw new TripNotFoundError();
  return {
    trip: presentTrip(row),
    canManage: access.canManage,
    history: row.statusHistory.map((entry: {
      fromStatus: string | null; toStatus: string; reason: string; createdAt: Date; actor: { name: string };
    }) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      reason: entry.reason,
      actorName: entry.actor.name,
      createdAt: entry.createdAt,
    })),
  };
}

async function createTripRow(
  tx: Prisma.TransactionClient,
  actorId: string,
  companyId: string,
  data: {
    clientId: string | null; routeId: string | null; scheduleId: string | null; serviceType: string | null;
    tripDate: string; plannedStartTime: string | null; plannedDurationMinutes: number | null;
    capacityLimit: number | null; reason: string;
  },
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = `TRP-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    try {
      const trip = await tx.trip.create({
        data: {
          companyId, clientId: data.clientId, routeId: data.routeId, scheduleId: data.scheduleId,
          reference, serviceType: data.serviceType,
          tripDate: new Date(`${data.tripDate}T00:00:00.000Z`),
          plannedStartTime: data.plannedStartTime,
          plannedDurationMinutes: data.plannedDurationMinutes,
          capacityLimit: data.capacityLimit,
          status: 'Planned',
        },
        include: tripInclude,
      });
      await tx.tripStatusHistory.create({
        data: { companyId, tripId: trip.id, sequence: 1, actorId, fromStatus: null, toStatus: 'Planned', reason: data.reason },
      });
      await tx.auditEvent.create({
        data: {
          actorId, companyId, action: 'TRIP_CREATED', entityType: 'TRIP', entityId: trip.id,
          summary: { reference, routeId: data.routeId, scheduleId: data.scheduleId, tripDate: data.tripDate, reason: data.reason },
        },
      });
      return presentTrip(trip);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 2) throw error;
    }
  }
  throw new TripValidationError('A unique trip reference could not be allocated; retry.');
}

export async function createTrip(input: unknown, actorId: string, companyIdInput: string) {
  const data = tripRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let clientId = data.clientId;
    let serviceType = data.serviceType;
    let plannedStartTime = data.plannedStartTime;
    let plannedDurationMinutes = data.plannedDurationMinutes;
    let capacityLimit = data.capacityLimit;
    if (data.routeId) {
      const route = await tx.route.findFirst({
        where: { id: data.routeId, companyId, archivedAt: null },
        select: {
          clientId: true, serviceType: true, plannedStartTime: true,
          expectedDurationMinutes: true, capacityRequirement: true,
        },
      });
      if (!route) throw new TripValidationError('Route not found in this company, or it is archived.');
      if (clientId && clientId !== route.clientId) {
        throw new TripValidationError('The client does not match the route\u2019s client.');
      }
      clientId = route.clientId;
      serviceType = serviceType ?? route.serviceType;
      plannedStartTime = plannedStartTime ?? route.plannedStartTime;
      plannedDurationMinutes = plannedDurationMinutes ?? route.expectedDurationMinutes;
      capacityLimit = capacityLimit ?? route.capacityRequirement;
    }
    if (clientId) {
      const client = await tx.client.findFirst({
        where: { id: clientId, companyId, archivedAt: null }, select: { id: true },
      });
      if (!client) throw new TripValidationError('Client not found in this company, or it is archived.');
    }
    return createTripRow(tx, actorId, companyId, {
      clientId, routeId: data.routeId, scheduleId: null, serviceType,
      tripDate: data.tripDate, plannedStartTime, plannedDurationMinutes, capacityLimit,
      reason: data.reason,
    });
  });
}

const WEEKDAY_BY_UTC_DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

function datesBetween(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Materializes Planned trips from active route schedules for a date range
 * (at most 31 days). One trip per schedule occurrence: regenerating the same
 * range creates nothing twice.
 */
export async function generateTripsFromSchedules(input: unknown, actorId: string, companyIdInput: string) {
  const data = tripGenerateSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  const schedules = await prisma.routeSchedule.findMany({
    where: { companyId, active: true, route: { is: { archivedAt: null, active: true } } },
    select: {
      id: true, routeId: true, kind: true, daysOfWeek: true, scheduleDate: true, plannedStartTime: true,
      route: { select: { clientId: true, serviceType: true, plannedStartTime: true, expectedDurationMinutes: true, capacityRequirement: true } },
    },
    take: 500,
  });
  const dates = datesBetween(data.fromDate, data.toDate);
  let created = 0;
  let skipped = 0;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const schedule of schedules) {
      for (const date of dates) {
        const scheduleDate = schedule.scheduleDate?.toISOString().slice(0, 10) ?? null;
        const matches = schedule.kind === 'ONE_TIME'
          ? scheduleDate === date
          : schedule.daysOfWeek.includes(WEEKDAY_BY_UTC_DAY[new Date(`${date}T00:00:00.000Z`).getUTCDay()]);
        if (!matches) continue;
        const existing = await tx.trip.findFirst({
          where: { companyId, scheduleId: schedule.id, tripDate: new Date(`${date}T00:00:00.000Z`) },
          select: { id: true },
        });
        if (existing) {
          skipped += 1;
          continue;
        }
        await createTripRow(tx, actorId, companyId, {
          clientId: schedule.route.clientId,
          routeId: schedule.routeId,
          scheduleId: schedule.id,
          serviceType: schedule.route.serviceType,
          tripDate: date,
          plannedStartTime: schedule.plannedStartTime ?? schedule.route.plannedStartTime,
          plannedDurationMinutes: schedule.route.expectedDurationMinutes,
          capacityLimit: schedule.route.capacityRequirement,
          reason: data.reason,
        });
        created += 1;
      }
    }
  });
  return { created, skipped, fromDate: data.fromDate, toDate: data.toDate };
}

async function releaseAssignedBookingsForCancelledTripTx(
  tx: Prisma.TransactionClient,
  actorId: string,
  companyId: string,
  tripId: string,
  tripReference: string,
  reason: string,
): Promise<number> {
  const assigned = await tx.booking.findMany({
    where: { companyId, tripId, status: 'Assigned' },
    select: { id: true, reference: true },
    take: 500,
  });
  let released = 0;
  for (const booking of assigned) {
    const changed = await tx.booking.updateMany({
      where: { id: booking.id, companyId, status: 'Assigned', tripId },
      data: { status: 'Accepted', tripId: null },
    });
    if (changed.count !== 1) continue;
    const latest = await tx.bookingStatusHistory.findFirst({
      where: { companyId, bookingId: booking.id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    await tx.bookingStatusHistory.create({
      data: {
        companyId, bookingId: booking.id, sequence: (latest?.sequence ?? 0) + 1, actorId,
        fromStatus: 'Assigned', toStatus: 'Accepted', reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'BOOKING_RELEASED_FROM_CANCELLED_TRIP', entityType: 'BOOKING', entityId: booking.id,
        summary: { bookingReference: booking.reference, tripReference, reason },
      },
    });
    released += 1;
  }
  return released;
}

export async function transitionTrip(input: unknown, actorId: string, companyIdInput: string, tripIdInput: string) {
  const data = tripTransitionSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const tripId = tripIdSchema.parse(tripIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{
      status: string; reference: string; vehicleId: string | null; driverId: string | null; actualStartAt: Date | null;
    }>>`
      SELECT "status", "reference", "vehicleId", "driverId", "actualStartAt" FROM "Trip"
      WHERE "id" = ${tripId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new TripNotFoundError();
    if (!isAllowedTripTransition(current.status, data.toStatus)) {
      throw new TripTransitionNotAllowedError(current.status, data.toStatus);
    }
    if (data.toStatus === 'Dispatched' && (!current.vehicleId || !current.driverId)) {
      throw new TripPolicyError('Assign a vehicle and a driver before dispatching this trip.');
    }
    const updateData: Prisma.TripUpdateManyMutationInput = { status: data.toStatus };
    if (data.toStatus === 'In Progress' && !current.actualStartAt) updateData.actualStartAt = new Date();
    if (data.toStatus === 'Completed') {
      updateData.actualEndAt = new Date();
      if (data.completionNotes) updateData.completionNotes = data.completionNotes;
    }
    if (data.toStatus === 'Delayed' && data.delayReason) updateData.delayReason = data.delayReason;
    const changed = await tx.trip.updateMany({
      where: { id: tripId, companyId, status: current.status },
      data: updateData,
    });
    if (changed.count !== 1) throw new TripTransitionNotAllowedError(current.status, data.toStatus);
    const latest = await tx.tripStatusHistory.findFirst({
      where: { companyId, tripId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    await tx.tripStatusHistory.create({
      data: {
        companyId, tripId, sequence: (latest?.sequence ?? 0) + 1, actorId,
        fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'TRIP_STATUS_CHANGED', entityType: 'TRIP', entityId: tripId,
        summary: { reference: current.reference, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason },
      },
    });
    if (data.toStatus === 'Cancelled') {
      // D-054: cancelling a trip releases its Assigned bookings back to
      // Accepted; Boarded passengers stay linked for incident handling.
      await releaseAssignedBookingsForCancelledTripTx(
        tx, actorId, companyId, tripId, current.reference,
        `Released because trip ${current.reference} was cancelled: ${data.reason}`,
      );
    }
    const trip = await tx.trip.findUniqueOrThrow({ where: { id: tripId }, include: tripInclude });
    return presentTrip(trip);
  });
}

/**
 * BKG-04: assigns an Accepted booking to a trip. The trip row is locked
 * (SELECT ... FOR UPDATE) inside the transaction and the manifest is counted
 * before the booking is added, so parallel assignments cannot exceed the
 * capacity basis (assigned vehicle seats when a vehicle is assigned,
 * otherwise the trip's recorded capacity limit).
 */
export async function assignBookingToTrip(input: unknown, actorId: string, companyIdInput: string, tripIdInput: string) {
  const data = tripAssignBookingSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const tripId = tripIdSchema.parse(tripIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{
      status: string; reference: string; clientId: string | null; routeId: string | null;
      tripDate: Date; capacityLimit: number | null; vehicleId: string | null;
    }>>`
      SELECT "status", "reference", "clientId", "routeId", "tripDate", "capacityLimit", "vehicleId" FROM "Trip"
      WHERE "id" = ${tripId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const trip = rows[0];
    if (!trip) throw new TripNotFoundError();
    if (!['Planned', 'Ready for Dispatch'].includes(trip.status)) {
      throw new TripPolicyError(`Bookings can only be assigned while the trip is Planned or Ready for Dispatch; this trip is ${trip.status}.`);
    }
    const booking = await tx.booking.findFirst({
      where: { id: data.bookingId, companyId },
      select: {
        id: true, status: true, clientId: true, routeId: true, journeyDate: true, tripId: true, reference: true,
      },
    });
    if (!booking) throw new TripValidationError('Booking not found in this company.');
    if (booking.status !== 'Accepted') {
      throw new TripPolicyError(`Only an Accepted booking can be assigned to a trip; this booking is ${booking.status}.`);
    }
    if (booking.journeyDate.toISOString().slice(0, 10) !== trip.tripDate.toISOString().slice(0, 10)) {
      throw new TripValidationError('The booking journey date does not match the trip date.');
    }
    if (trip.clientId && booking.clientId !== trip.clientId) {
      throw new TripValidationError('The booking belongs to a different client than the trip.');
    }
    if (trip.routeId && booking.routeId && booking.routeId !== trip.routeId) {
      throw new TripValidationError('The booking is for a different route than the trip.');
    }
    let capacityBasis = trip.capacityLimit;
    if (trip.vehicleId) {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: trip.vehicleId, companyId }, select: { seatCount: true },
      });
      capacityBasis = vehicle?.seatCount ?? capacityBasis;
    }
    if (capacityBasis !== null) {
      const current = await tx.booking.count({
        where: { companyId, tripId, status: { in: [...MANIFEST_STATUSES] } },
      });
      if (current + 1 > capacityBasis) throw new TripCapacityError(capacityBasis);
    }
    const changed = await tx.booking.updateMany({
      where: { id: booking.id, companyId, status: 'Accepted' },
      data: { status: 'Assigned', tripId },
    });
    if (changed.count !== 1) throw new TripPolicyError('The booking changed concurrently; reload and retry.');
    const latest = await tx.bookingStatusHistory.findFirst({
      where: { companyId, bookingId: booking.id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    await tx.bookingStatusHistory.create({
      data: {
        companyId, bookingId: booking.id, sequence: (latest?.sequence ?? 0) + 1, actorId,
        fromStatus: 'Accepted', toStatus: 'Assigned', reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'BOOKING_ASSIGNED_TO_TRIP', entityType: 'BOOKING', entityId: booking.id,
        summary: { bookingReference: booking.reference, tripReference: trip.reference, reason: data.reason },
      },
    });
    // NTF-01 (D-068): tell the linked passenger their bus is assigned.
    const assignedBooking = await tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { employeeId: true, bookingType: true, reference: true, journeyDate: true },
    });
    await notifyLinkedEmployee(tx, {
      companyId, actorId, employeeId: assignedBooking.employeeId,
      type: 'BOOKING_ASSIGNED_TO_TRIP', entityType: 'BOOKING', entityId: booking.id,
      dedupeKey: `booking:${booking.id}:assigned:trip:${tripId}`,
      ...bookingAssignedNotification({
        reference: assignedBooking.reference,
        journeyDate: assignedBooking.journeyDate.toISOString().slice(0, 10),
        bookingType: assignedBooking.bookingType,
      }, trip.reference),
    });
    const updated = await tx.trip.findUniqueOrThrow({ where: { id: tripId }, include: tripInclude });
    return presentTrip(updated);
  });
}

export async function unassignBookingFromTrip(input: unknown, actorId: string, companyIdInput: string, tripIdInput: string) {
  const data = tripUnassignBookingSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const tripId = tripIdSchema.parse(tripIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{ status: string; reference: string }>>`
      SELECT "status", "reference" FROM "Trip"
      WHERE "id" = ${tripId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const trip = rows[0];
    if (!trip) throw new TripNotFoundError();
    if (!['Planned', 'Ready for Dispatch'].includes(trip.status)) {
      throw new TripPolicyError(`Bookings can only be removed while the trip is Planned or Ready for Dispatch; this trip is ${trip.status}.`);
    }
    const booking = await tx.booking.findFirst({
      where: { id: data.bookingId, companyId, tripId },
      select: { id: true, status: true, reference: true },
    });
    if (!booking) throw new TripValidationError('Booking not found on this trip.');
    if (booking.status !== 'Assigned') {
      throw new TripPolicyError(`Only an Assigned booking can be removed from a trip; this booking is ${booking.status}.`);
    }
    const changed = await tx.booking.updateMany({
      where: { id: booking.id, companyId, status: 'Assigned', tripId },
      data: { status: 'Accepted', tripId: null },
    });
    if (changed.count !== 1) throw new TripPolicyError('The booking changed concurrently; reload and retry.');
    const latest = await tx.bookingStatusHistory.findFirst({
      where: { companyId, bookingId: booking.id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    await tx.bookingStatusHistory.create({
      data: {
        companyId, bookingId: booking.id, sequence: (latest?.sequence ?? 0) + 1, actorId,
        fromStatus: 'Assigned', toStatus: 'Accepted', reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'BOOKING_REMOVED_FROM_TRIP', entityType: 'BOOKING', entityId: booking.id,
        summary: { bookingReference: booking.reference, tripReference: trip.reference, reason: data.reason },
      },
    });
    const updated = await tx.trip.findUniqueOrThrow({ where: { id: tripId }, include: tripInclude });
    return presentTrip(updated);
  });
}

export type TripManifestEntry = {
  bookingId: string;
  bookingReference: string;
  employeeName: string;
  bookingType: string;
  pickupName: string | null;
  dropoffName: string | null;
  status: string;
};

export type TripManifest = {
  trip: TripRecord;
  passengerCount: number;
  capacityBasis: number | null;
  capacityNote: string;
  entries: TripManifestEntry[];
};

/**
 * Passenger manifest (TRP-02). Only operational fields are projected:
 * employee name, journey type and pickup/drop-off names. Restricted employee
 * fields (home address, contacts, accessibility needs) are never included.
 */
export async function getTripManifest(input: { actorId: string; companyId: string; tripId: string }): Promise<TripManifest> {
  const { trip } = await getTrip(input);
  const companyId = companyIdSchema.parse(input.companyId);
  const prisma = getPrisma();
  const rows = await prisma.booking.findMany({
    where: { companyId, tripId: trip.id, status: { in: [...MANIFEST_STATUSES] } },
    orderBy: [{ employee: { fullName: 'asc' } }, { id: 'asc' }],
    select: {
      id: true, reference: true, bookingType: true, status: true,
      employee: { select: { fullName: true } },
      pickupLocation: { select: { name: true } },
      dropoffLocation: { select: { name: true } },
    },
    take: 500,
  });
  let capacityBasis = trip.capacityLimit;
  if (trip.vehicleId) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: trip.vehicleId, companyId }, select: { seatCount: true },
    });
    capacityBasis = vehicle?.seatCount ?? capacityBasis;
  }
  return {
    trip,
    passengerCount: rows.length,
    capacityBasis,
    capacityNote: capacityBasis === null
      ? 'No capacity basis is recorded for this trip (no vehicle seats or route capacity requirement), so capacity is not being checked.'
      : `Capacity is checked against ${capacityBasis} seat(s).`,
    entries: rows.map((row: {
      id: string; reference: string; bookingType: string; status: string;
      employee: { fullName: string };
      pickupLocation: { name: string } | null;
      dropoffLocation: { name: string } | null;
    }) => ({
      bookingId: row.id,
      bookingReference: row.reference,
      employeeName: row.employee.fullName,
      bookingType: row.bookingType,
      pickupName: row.pickupLocation?.name ?? null,
      dropoffName: row.dropoffLocation?.name ?? null,
      status: row.status,
    })),
  };
}
