import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { isAllowedTripTransition, type TripStatus } from '@/modules/trips/trip-transitions';
import { driverEventSchema, driverTripListQuerySchema, type DriverEventType } from './driver-schema';

const companyIdSchema = z.string().trim().min(1).max(128);
const tripIdSchema = z.string().trim().min(1).max(128);
const MANIFEST_STATUSES = ['Assigned', 'Boarded', 'Completed'];

export class DriverCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'DriverCompanyNotFoundError'; }
}
export class DriverNotLinkedError extends Error {
  readonly code = 'DRIVER_NOT_LINKED';
  constructor() {
    super('Your login is not linked to a driver record yet. Ask the operations team to link it before using the driver view.');
    this.name = 'DriverNotLinkedError';
  }
}
export class DriverTripNotFoundError extends Error {
  readonly code = 'TRIP_NOT_FOUND';
  constructor() { super('Trip not found.'); this.name = 'DriverTripNotFoundError'; }
}
export class DriverValidationError extends Error {
  readonly code = 'DRIVER_VALIDATION';
  constructor(message: string) { super(message); this.name = 'DriverValidationError'; }
}
export class DriverEventConflictError extends Error {
  readonly code = 'DRIVER_EVENT_IDEMPOTENCY_CONFLICT';
  constructor() {
    super('This idempotency key was already used for a different event on this trip. Use a new key.');
    this.name = 'DriverEventConflictError';
  }
}

export type DriverTripSummary = {
  id: string;
  reference: string;
  routeName: string | null;
  clientName: string | null;
  tripDate: string;
  plannedStartTime: string | null;
  status: string;
  passengerCount: number;
  pickupNames: string[];
};

export type DriverTripDetail = DriverTripSummary & {
  vehicleRegistration: string | null;
  manifest: Array<{
    bookingId: string; bookingReference: string; employeeName: string;
    bookingType: string; pickupName: string | null; dropoffName: string | null; status: string;
  }>;
  events: Array<{ eventType: string; createdAt: Date }>;
};

/**
 * Resolves the calling driver's record. Requires the DRIVER role's seeded
 * trip:dispatch OWN_TRIP_EVENTS scope and an audited Driver.userId link;
 * anything else fails closed.
 */
async function driverContext(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'trip:dispatch' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new DriverCompanyNotFoundError();
  const isDriver = permission.scopes.includes('OWN_TRIP_EVENTS');
  const isStaff = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!isDriver && !isStaff) throw new PermissionDeniedError();
  const driver = await getPrisma().driver.findFirst({
    where: { userId: actorId, companyId, archivedAt: null },
    select: { id: true, fullName: true },
  });
  if (!driver) throw new DriverNotLinkedError();
  return { driver, isStaff };
}

export async function linkDriverAccount(input: {
  actorId: string; companyId: string; driverId: string; userId: string; reason: string;
}) {
  const companyId = companyIdSchema.parse(input.companyId);
  const data = z.object({
    driverId: z.string().trim().min(1).max(128),
    userId: z.string().trim().min(1).max(128),
    reason: z.string().trim().min(8).max(500),
  }).parse(input);
  const permission = await resolvePermission({ userId: input.actorId, companyId, permission: 'driver:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  if (!permission.scopes.includes('GLOBAL') && !permission.scopes.includes('COMPANY')) throw new PermissionDeniedError();
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const [driver, user] = await Promise.all([
      tx.driver.findFirst({ where: { id: data.driverId, companyId }, select: { id: true, fullName: true } }),
      tx.user.findUnique({ where: { id: data.userId }, select: { id: true, status: true } }),
    ]);
    if (!driver) throw new DriverValidationError('Driver not found in this company.');
    if (!user || user.status !== 'ACTIVE') throw new DriverValidationError('The login account must exist and be active.');
    await tx.driver.update({ where: { id: driver.id }, data: { userId: data.userId } });
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId, companyId, action: 'DRIVER_ACCOUNT_LINKED', entityType: 'DRIVER', entityId: driver.id,
        summary: { driverName: driver.fullName, userId: data.userId, reason: data.reason },
      },
    });
    return { driverId: driver.id, userId: data.userId };
  });
}

export async function listDriverTrips(input: {
  actorId: string; companyId: string; date?: string;
}): Promise<{ trips: DriverTripSummary[]; driverName: string }> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = driverTripListQuerySchema.parse({ date: input.date || undefined });
  const { driver } = await driverContext(input.actorId, companyId);
  const prisma = getPrisma();
  const rows = await prisma.trip.findMany({
    where: {
      companyId,
      driverId: driver.id,
      ...(query.date ? { tripDate: new Date(`${query.date}T00:00:00.000Z`) } : {}),
    },
    orderBy: [{ tripDate: 'asc' }, { plannedStartTime: 'asc' }, { id: 'asc' }],
    select: {
      id: true, reference: true, tripDate: true, plannedStartTime: true, status: true,
      route: { select: { name: true } },
      client: { select: { name: true } },
      _count: { select: { bookings: { where: { status: { in: [...MANIFEST_STATUSES] } } } } },
      bookings: {
        where: { status: { in: [...MANIFEST_STATUSES] } },
        select: { pickupLocation: { select: { name: true } } },
        take: 50,
      },
    },
    take: 100,
  });
  return {
    driverName: driver.fullName,
    trips: rows.map((row: {
      id: string; reference: string; tripDate: Date; plannedStartTime: string | null; status: string;
      route: { name: string } | null; client: { name: string } | null;
      _count: { bookings: number };
      bookings: Array<{ pickupLocation: { name: string } | null }>;
    }) => ({
      id: row.id,
      reference: row.reference,
      routeName: row.route?.name ?? null,
      clientName: row.client?.name ?? null,
      tripDate: row.tripDate.toISOString().slice(0, 10),
      plannedStartTime: row.plannedStartTime,
      status: row.status,
      passengerCount: row._count.bookings,
      pickupNames: [...new Set(row.bookings.flatMap((booking) => (booking.pickupLocation ? [booking.pickupLocation.name] : [])))],
    })),
  };
}

export async function getDriverTrip(input: {
  actorId: string; companyId: string; tripId: string;
}): Promise<DriverTripDetail> {
  const companyId = companyIdSchema.parse(input.companyId);
  const tripId = tripIdSchema.parse(input.tripId);
  const { driver } = await driverContext(input.actorId, companyId);
  const prisma = getPrisma();
  const row = await prisma.trip.findFirst({
    where: { id: tripId, companyId, driverId: driver.id },
    select: {
      id: true, reference: true, tripDate: true, plannedStartTime: true, status: true,
      route: { select: { name: true } },
      client: { select: { name: true } },
      vehicle: { select: { registrationNumber: true } },
      bookings: {
        where: { status: { in: [...MANIFEST_STATUSES] } },
        orderBy: [{ employee: { fullName: 'asc' } }, { id: 'asc' }],
        select: {
          id: true, reference: true, bookingType: true, status: true,
          employee: { select: { fullName: true } },
          pickupLocation: { select: { name: true } },
          dropoffLocation: { select: { name: true } },
        },
        take: 200,
      },
      driverEvents: {
        orderBy: { createdAt: 'desc' },
        select: { eventType: true, createdAt: true },
        take: 50,
      },
    },
  });
  if (!row) throw new DriverTripNotFoundError();
  return {
    id: row.id,
    reference: row.reference,
    routeName: row.route?.name ?? null,
    clientName: row.client?.name ?? null,
    tripDate: row.tripDate.toISOString().slice(0, 10),
    plannedStartTime: row.plannedStartTime,
    status: row.status,
    passengerCount: row.bookings.length,
    pickupNames: [...new Set(row.bookings.flatMap((booking) => (booking.pickupLocation ? [booking.pickupLocation.name] : [])))],
    vehicleRegistration: row.vehicle?.registrationNumber ?? null,
    manifest: row.bookings.map((booking: {
      id: string; reference: string; bookingType: string; status: string;
      employee: { fullName: string };
      pickupLocation: { name: string } | null;
      dropoffLocation: { name: string } | null;
    }) => ({
      bookingId: booking.id,
      bookingReference: booking.reference,
      employeeName: booking.employee.fullName,
      bookingType: booking.bookingType,
      pickupName: booking.pickupLocation?.name ?? null,
      dropoffName: booking.dropoffLocation?.name ?? null,
      status: booking.status,
    })),
    events: row.driverEvents.map((event: { eventType: string; createdAt: Date }) => ({
      eventType: event.eventType, createdAt: event.createdAt,
    })),
  };
}

const EVENT_TARGET: Partial<Record<DriverEventType, TripStatus>> = {
  START: 'In Progress',
  DELAY: 'Delayed',
  RESUME: 'In Progress',
  INTERRUPT: 'Interrupted',
  COMPLETE: 'Completed',
};

export type DriverEventResult = {
  eventId: string;
  duplicate: boolean;
  tripStatus: string;
};

/**
 * Applies one driver event exactly once. The (company, trip, idempotencyKey)
 * unique constraint plus the trip row lock make retries safe: a replayed key
 * with the same event returns the stored result without re-applying, and the
 * same key with a different event is a conflict.
 */
export async function postDriverEvent(
  input: unknown, actorId: string, companyIdInput: string, tripIdInput: string,
): Promise<DriverEventResult> {
  const data = driverEventSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const tripId = tripIdSchema.parse(tripIdInput);
  const { driver } = await driverContext(actorId, companyId);
  const prisma = getPrisma();

  const existing = await prisma.driverEvent.findFirst({
    where: { companyId, tripId, idempotencyKey: data.idempotencyKey },
    select: { id: true, eventType: true },
  });
  if (existing) {
    if (existing.eventType !== data.eventType) throw new DriverEventConflictError();
    const trip = await prisma.trip.findFirst({ where: { id: tripId, companyId }, select: { status: true } });
    if (!trip) throw new DriverTripNotFoundError();
    return { eventId: existing.id, duplicate: true, tripStatus: trip.status };
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{
      status: string; reference: string; driverId: string | null; actualStartAt: Date | null;
    }>>`
      SELECT "status", "reference", "driverId", "actualStartAt" FROM "Trip"
      WHERE "id" = ${tripId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const trip = rows[0];
    if (!trip || trip.driverId !== driver.id) throw new DriverTripNotFoundError();

    const raced = await tx.driverEvent.findFirst({
      where: { companyId, tripId, idempotencyKey: data.idempotencyKey },
      select: { id: true, eventType: true },
    });
    if (raced) {
      if (raced.eventType !== data.eventType) throw new DriverEventConflictError();
      return { eventId: raced.id, duplicate: true, tripStatus: trip.status };
    }

    const reason = (data.reason ?? '').trim()
      || `Driver ${data.eventType.toLowerCase().replaceAll('_', ' ')} event from the driver interface`;
    let nextStatus = trip.status;

    if (data.eventType === 'BOARD' || data.eventType === 'NO_SHOW') {
      const booking = await tx.booking.findFirst({
        where: { id: data.bookingId ?? '', companyId, tripId },
        select: { id: true, status: true, reference: true },
      });
      if (!booking) throw new DriverValidationError('Booking not found on this trip.');
      const fromStatus = booking.status;
      const toStatus = data.eventType === 'BOARD' ? 'Boarded' : 'Cancelled';
      if (fromStatus !== 'Assigned') {
        throw new DriverValidationError(
          data.eventType === 'BOARD'
            ? `Only an Assigned passenger can board; this booking is ${fromStatus}.`
            : `Only an Assigned passenger can be marked as a no-show; this booking is ${fromStatus}.`,
        );
      }
      if (data.eventType === 'BOARD' && !['Dispatched', 'In Progress', 'Delayed'].includes(trip.status)) {
        throw new DriverValidationError(`Passengers can board only after dispatch; this trip is ${trip.status}.`);
      }
      const changed = await tx.booking.updateMany({
        where: { id: booking.id, companyId, status: 'Assigned', tripId },
        data: { status: toStatus },
      });
      if (changed.count !== 1) throw new DriverValidationError('The booking changed concurrently; reload and retry.');
      const latest = await tx.bookingStatusHistory.findFirst({
        where: { companyId, bookingId: booking.id },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      await tx.bookingStatusHistory.create({
        data: {
          companyId, bookingId: booking.id, sequence: (latest?.sequence ?? 0) + 1, actorId,
          fromStatus, toStatus,
          reason: data.eventType === 'BOARD' ? reason : `Passenger no-show reported by driver: ${reason}`,
        },
      });
    } else if (data.eventType === 'REPORT_DEFECT') {
      // D-055: recorded against the trip; dispatch/fleet decide on blocks.
      await tx.auditEvent.create({
        data: {
          actorId, companyId, action: 'DRIVER_DEFECT_REPORTED', entityType: 'TRIP', entityId: tripId,
          summary: { reference: trip.reference, reason, notes: data.notes ?? null },
        },
      });
    } else {
      const target = EVENT_TARGET[data.eventType];
      if (!target) throw new DriverValidationError('Unsupported driver event.');
      if (!isAllowedTripTransition(trip.status, target)) {
        throw new DriverValidationError(`Cannot apply ${data.eventType} while the trip is ${trip.status}.`);
      }
      const updateData: Prisma.TripUpdateManyMutationInput = { status: target };
      if (target === 'In Progress' && !trip.actualStartAt) updateData.actualStartAt = new Date();
      if (target === 'Completed') {
        updateData.actualEndAt = new Date();
        if (data.notes) updateData.completionNotes = data.notes;
      }
      if (target === 'Delayed') updateData.delayReason = reason;
      const changed = await tx.trip.updateMany({
        where: { id: tripId, companyId, status: trip.status },
        data: updateData,
      });
      if (changed.count !== 1) throw new DriverValidationError('The trip changed concurrently; reload and retry.');
      const latest = await tx.tripStatusHistory.findFirst({
        where: { companyId, tripId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      await tx.tripStatusHistory.create({
        data: {
          companyId, tripId, sequence: (latest?.sequence ?? 0) + 1, actorId,
          fromStatus: trip.status, toStatus: target, reason,
        },
      });
      nextStatus = target;
      if (target === 'Completed') {
        const boarded = await tx.booking.findMany({
          where: { companyId, tripId, status: 'Boarded' },
          select: { id: true, reference: true },
          take: 500,
        });
        for (const booking of boarded) {
          await tx.booking.updateMany({
            where: { id: booking.id, companyId, status: 'Boarded', tripId },
            data: { status: 'Completed' },
          });
          const latestBooking = await tx.bookingStatusHistory.findFirst({
            where: { companyId, bookingId: booking.id },
            orderBy: { sequence: 'desc' },
            select: { sequence: true },
          });
          await tx.bookingStatusHistory.create({
            data: {
              companyId, bookingId: booking.id, sequence: (latestBooking?.sequence ?? 0) + 1, actorId,
              fromStatus: 'Boarded', toStatus: 'Completed', reason,
            },
          });
        }
      }
    }

    const event = await tx.driverEvent.create({
      data: {
        companyId, tripId, driverId: driver.id, actorId,
        idempotencyKey: data.idempotencyKey, eventType: data.eventType,
        summary: { reason, bookingId: data.bookingId ?? null, notes: data.notes ?? null },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'DRIVER_EVENT', entityType: 'TRIP', entityId: tripId,
        summary: { reference: trip.reference, eventType: data.eventType, reason, bookingId: data.bookingId ?? null },
      },
    });
    return { eventId: event.id, duplicate: false, tripStatus: nextStatus };
  });
}
