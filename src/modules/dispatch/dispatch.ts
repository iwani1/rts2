import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { safetyStatusForVehicles } from '@/modules/maintenance/vehicle-safety-blocks';
import { getTripManifest, type TripManifestEntry, type TripRecord } from '@/modules/trips/trips';
import { dispatchBoardQuerySchema, tripNoShowSchema, tripResourceAssignmentSchema } from './dispatch-schema';

const companyIdSchema = z.string().trim().min(1).max(128);
const tripIdSchema = z.string().trim().min(1).max(128);
const ACTIVE_TRIP_STATUSES = ['Planned', 'Ready for Dispatch', 'Dispatched', 'In Progress', 'Delayed', 'Interrupted'];

export class DispatchCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'DispatchCompanyNotFoundError'; }
}
export class DispatchTripNotFoundError extends Error {
  readonly code = 'TRIP_NOT_FOUND';
  constructor() { super('Trip not found.'); this.name = 'DispatchTripNotFoundError'; }
}
export class DispatchValidationError extends Error {
  readonly code = 'DISPATCH_VALIDATION';
  constructor(message: string) { super(message); this.name = 'DispatchValidationError'; }
}
export class DispatchAssignmentNotAllowedError extends Error {
  readonly code = 'DISPATCH_ASSIGNMENT_NOT_ALLOWED';
  constructor(message: string) { super(message); this.name = 'DispatchAssignmentNotAllowedError'; }
}

export type DispatchConflict =
  | { type: 'VEHICLE_DAY_CONFLICT'; otherTripReference: string; overridable: true }
  | { type: 'DRIVER_DAY_CONFLICT'; otherTripReference: string; overridable: true }
  | { type: 'VEHICLE_SEATS_BELOW_REQUIREMENT'; seatCount: number; required: number; overridable: true }
  | { type: 'PASSENGERS_EXCEED_VEHICLE_SEATS'; passengers: number; seatCount: number; overridable: true }
  | { type: 'VEHICLE_ARCHIVED'; overridable: false }
  | { type: 'VEHICLE_SAFETY_BLOCKED'; overridable: false }
  | { type: 'DRIVER_ARCHIVED'; overridable: false }
  | { type: 'DRIVER_LICENCE_EXPIRED'; licenceExpiresAt: string; overridable: false };

export type DispatchBoardTrip = TripRecord & {
  capacityBasis: number | null;
  warnings: DispatchConflict[];
};

export type DispatchBoard = {
  date: string;
  trips: DispatchBoardTrip[];
  unassignedAcceptedBookings: Array<{ bookingId: string; bookingReference: string; employeeName: string; routeId: string | null }>;
  canManage: boolean;
};

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'trip:dispatch' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new DispatchCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

async function evaluateConflicts(
  db: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  companyId: string,
  trip: { id: string; vehicleId: string | null; driverId: string | null; capacityLimit: number | null },
  date: Date,
  passengerCount: number,
): Promise<DispatchConflict[]> {
  const conflicts: DispatchConflict[] = [];
  if (trip.vehicleId) {
    const vehicle = await db.vehicle.findFirst({
      where: { id: trip.vehicleId, companyId },
      select: { id: true, seatCount: true, archivedAt: true },
    });
    if (vehicle?.archivedAt) conflicts.push({ type: 'VEHICLE_ARCHIVED', overridable: false });
    if (vehicle) {
      const blocks = await safetyStatusForVehicles(companyId, [vehicle.id]);
      if (blocks.has(vehicle.id)) conflicts.push({ type: 'VEHICLE_SAFETY_BLOCKED', overridable: false });
      if (vehicle.seatCount !== null && trip.capacityLimit !== null && vehicle.seatCount < trip.capacityLimit) {
        conflicts.push({ type: 'VEHICLE_SEATS_BELOW_REQUIREMENT', seatCount: vehicle.seatCount, required: trip.capacityLimit, overridable: true });
      }
      if (vehicle.seatCount !== null && passengerCount > vehicle.seatCount) {
        conflicts.push({ type: 'PASSENGERS_EXCEED_VEHICLE_SEATS', passengers: passengerCount, seatCount: vehicle.seatCount, overridable: true });
      }
    }
    const other = await db.trip.findFirst({
      where: {
        companyId, vehicleId: trip.vehicleId, tripDate: date,
        status: { in: [...ACTIVE_TRIP_STATUSES] }, id: { not: trip.id },
      },
      select: { reference: true },
    });
    if (other) conflicts.push({ type: 'VEHICLE_DAY_CONFLICT', otherTripReference: other.reference, overridable: true });
  }
  if (trip.driverId) {
    const driver = await db.driver.findFirst({
      where: { id: trip.driverId, companyId },
      select: { archivedAt: true, licenceExpiresAt: true },
    });
    if (driver?.archivedAt) conflicts.push({ type: 'DRIVER_ARCHIVED', overridable: false });
    if (driver?.licenceExpiresAt && driver.licenceExpiresAt < date) {
      conflicts.push({
        type: 'DRIVER_LICENCE_EXPIRED',
        licenceExpiresAt: driver.licenceExpiresAt.toISOString().slice(0, 10),
        overridable: false,
      });
    }
    const other = await db.trip.findFirst({
      where: {
        companyId, driverId: trip.driverId, tripDate: date,
        status: { in: [...ACTIVE_TRIP_STATUSES] }, id: { not: trip.id },
      },
      select: { reference: true },
    });
    if (other) conflicts.push({ type: 'DRIVER_DAY_CONFLICT', otherTripReference: other.reference, overridable: true });
  }
  return conflicts;
}

/**
 * DSP-01 daily dispatch board. Pure read model over trips: it works with no
 * map provider and never claims optimisation. Each trip carries its current
 * resource-assignment conflicts as warnings so dispatchers see problems
 * before confirming changes.
 */
export async function getDispatchBoard(input: { actorId: string; companyId: string; date: string }): Promise<DispatchBoard> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = dispatchBoardQuerySchema.parse({ date: input.date });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const dayDate = new Date(`${query.date}T00:00:00.000Z`);
  const rows = await prisma.trip.findMany({
    where: { companyId, tripDate: dayDate },
    orderBy: [{ plannedStartTime: 'asc' }, { id: 'asc' }],
    select: {
      id: true, reference: true, clientId: true, routeId: true, scheduleId: true, serviceType: true,
      tripDate: true, plannedStartTime: true, plannedDurationMinutes: true, capacityLimit: true,
      vehicleId: true, driverId: true, status: true, delayReason: true, completionNotes: true,
      actualStartAt: true, actualEndAt: true, createdAt: true, updatedAt: true,
      client: { select: { name: true } },
      route: { select: { name: true } },
      vehicle: { select: { registrationNumber: true, seatCount: true } },
      driver: { select: { fullName: true } },
      _count: { select: { bookings: { where: { status: { in: ['Assigned', 'Boarded', 'Completed'] } } } } },
    },
    take: 200,
  });
  const trips: DispatchBoardTrip[] = [];
  for (const row of rows) {
    const base: TripRecord = {
      id: row.id, reference: row.reference, clientId: row.clientId, clientName: row.client?.name ?? null,
      routeId: row.routeId, routeName: row.route?.name ?? null, scheduleId: row.scheduleId,
      serviceType: row.serviceType, tripDate: row.tripDate.toISOString().slice(0, 10),
      plannedStartTime: row.plannedStartTime, plannedDurationMinutes: row.plannedDurationMinutes,
      capacityLimit: row.capacityLimit, vehicleId: row.vehicleId,
      vehicleRegistration: row.vehicle?.registrationNumber ?? null, driverId: row.driverId,
      driverName: row.driver?.fullName ?? null, status: row.status,
      passengerCount: row._count.bookings, delayReason: row.delayReason,
      completionNotes: row.completionNotes, actualStartAt: row.actualStartAt, actualEndAt: row.actualEndAt,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
    const warnings = await evaluateConflicts(prisma, companyId, row, dayDate, row._count.bookings);
    trips.push({
      ...base,
      capacityBasis: row.vehicle?.seatCount ?? row.capacityLimit,
      warnings,
    });
  }
  const unassigned = await prisma.booking.findMany({
    where: { companyId, status: 'Accepted', journeyDate: dayDate },
    orderBy: [{ employee: { fullName: 'asc' } }, { id: 'asc' }],
    select: { id: true, reference: true, routeId: true, employee: { select: { fullName: true } } },
    take: 200,
  });
  return {
    date: query.date,
    trips,
    unassignedAcceptedBookings: unassigned.map((booking: {
      id: string; reference: string; routeId: string | null; employee: { fullName: string };
    }) => ({
      bookingId: booking.id,
      bookingReference: booking.reference,
      employeeName: booking.employee.fullName,
      routeId: booking.routeId,
    })),
    canManage: access.canManage,
  };
}

export type ResourceAssignmentResult = {
  trip: TripRecord;
  warnings: DispatchConflict[];
};

/**
 * DSP-02: assigns or clears the vehicle/driver of a Planned or Ready trip.
 * Hard blocks (archived, safety-blocked, licence-expired) refuse regardless
 * of override; day conflicts and seat shortfalls require `override: true`
 * plus the audited reason.
 */
export async function assignTripResources(
  input: unknown, actorId: string, companyIdInput: string, tripIdInput: string,
): Promise<ResourceAssignmentResult> {
  const data = tripResourceAssignmentSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const tripId = tripIdSchema.parse(tripIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{
      status: string; reference: string; vehicleId: string | null; driverId: string | null;
      capacityLimit: number | null; tripDate: Date;
    }>>`
      SELECT "status", "reference", "vehicleId", "driverId", "capacityLimit", "tripDate" FROM "Trip"
      WHERE "id" = ${tripId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const trip = rows[0];
    if (!trip) throw new DispatchTripNotFoundError();
    if (!['Planned', 'Ready for Dispatch'].includes(trip.status)) {
      throw new DispatchAssignmentNotAllowedError(`Resources can only change while the trip is Planned or Ready for Dispatch; this trip is ${trip.status}.`);
    }
    const nextVehicleId = data.vehicleId === undefined ? trip.vehicleId : data.vehicleId;
    const nextDriverId = data.driverId === undefined ? trip.driverId : data.driverId;
    if (nextVehicleId) {
      const vehicle = await tx.vehicle.findFirst({ where: { id: nextVehicleId, companyId }, select: { id: true } });
      if (!vehicle) throw new DispatchValidationError('Vehicle not found in this company.');
    }
    if (nextDriverId) {
      const driver = await tx.driver.findFirst({ where: { id: nextDriverId, companyId }, select: { id: true } });
      if (!driver) throw new DispatchValidationError('Driver not found in this company.');
    }
    const passengerCount = await tx.booking.count({
      where: { companyId, tripId, status: { in: ['Assigned', 'Boarded', 'Completed'] } },
    });
    const conflicts = await evaluateConflicts(
      tx, companyId,
      { id: tripId, vehicleId: nextVehicleId, driverId: nextDriverId, capacityLimit: trip.capacityLimit },
      trip.tripDate, passengerCount,
    );
    // A resource change must not be re-gated by conflicts it does not cause:
    // conflicts already present on the untouched assignment surface on the
    // dispatch board as warnings, but only conflicts touching the resource
    // being changed here can block this call.
    const previous = await evaluateConflicts(
      tx, companyId,
      { id: tripId, vehicleId: trip.vehicleId, driverId: trip.driverId, capacityLimit: trip.capacityLimit },
      trip.tripDate, passengerCount,
    );
    const previousTypes = new Set(previous.map((conflict) => conflict.type));
    const introduced = conflicts.filter((conflict) => !previousTypes.has(conflict.type));
    const hard = introduced.filter((conflict) => !conflict.overridable);
    if (hard.length > 0) {
      throw new DispatchAssignmentNotAllowedError(
        `This assignment is blocked: ${hard.map((conflict) => conflict.type).join(', ')}. Resolve the block before assigning.`,
      );
    }
    if (introduced.length > 0 && !data.override) {
      throw new DispatchAssignmentNotAllowedError(
        `This assignment has conflicts (${introduced.map((conflict) => conflict.type).join(', ')}). Confirm the override with a reason to proceed.`,
      );
    }
    await tx.trip.updateMany({
      where: { id: tripId, companyId },
      data: { vehicleId: nextVehicleId, driverId: nextDriverId },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'TRIP_RESOURCES_ASSIGNED', entityType: 'TRIP', entityId: tripId,
        summary: {
          reference: trip.reference,
          vehicleId: nextVehicleId, driverId: nextDriverId,
          previousVehicleId: trip.vehicleId, previousDriverId: trip.driverId,
          override: data.override, conflicts: conflicts.map((conflict) => conflict.type),
          reason: data.reason,
        },
      },
    });
    const updated = await tx.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: {
        client: { select: { name: true } },
        route: { select: { name: true } },
        vehicle: { select: { registrationNumber: true, seatCount: true } },
        driver: { select: { fullName: true } },
        _count: { select: { bookings: { where: { status: { in: ['Assigned', 'Boarded', 'Completed'] } } } } },
      },
    });
    return {
      trip: {
        id: updated.id, reference: updated.reference, clientId: updated.clientId,
        clientName: updated.client?.name ?? null, routeId: updated.routeId,
        routeName: updated.route?.name ?? null, scheduleId: updated.scheduleId,
        serviceType: updated.serviceType, tripDate: updated.tripDate.toISOString().slice(0, 10),
        plannedStartTime: updated.plannedStartTime, plannedDurationMinutes: updated.plannedDurationMinutes,
        capacityLimit: updated.capacityLimit, vehicleId: updated.vehicleId,
        vehicleRegistration: updated.vehicle?.registrationNumber ?? null, driverId: updated.driverId,
        driverName: updated.driver?.fullName ?? null, status: updated.status,
        passengerCount: updated._count.bookings, delayReason: updated.delayReason,
        completionNotes: updated.completionNotes, actualStartAt: updated.actualStartAt,
        actualEndAt: updated.actualEndAt, createdAt: updated.createdAt, updatedAt: updated.updatedAt,
      },
      warnings: introduced,
    };
  });
}

/**
 * DSP-04: records a passenger no-show. The booking is cancelled through the
 * booking lifecycle (Assigned → Cancelled) with the no-show reason, freeing
 * the manifest seat; history and audit are written on the booking.
 */
export async function recordTripNoShow(
  input: unknown, actorId: string, companyIdInput: string, tripIdInput: string,
): Promise<{ trip: TripRecord; entries: TripManifestEntry[] }> {
  const data = tripNoShowSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const tripId = tripIdSchema.parse(tripIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const booking = await tx.booking.findFirst({
      where: { id: data.bookingId, companyId, tripId },
      select: { id: true, status: true, reference: true },
    });
    if (!booking) throw new DispatchValidationError('Booking not found on this trip.');
    if (booking.status !== 'Assigned') {
      throw new DispatchValidationError(`Only an Assigned booking can be marked as a no-show; this booking is ${booking.status}.`);
    }
    const changed = await tx.booking.updateMany({
      where: { id: booking.id, companyId, status: 'Assigned', tripId },
      data: { status: 'Cancelled' },
    });
    if (changed.count !== 1) throw new DispatchValidationError('The booking changed concurrently; reload and retry.');
    const latest = await tx.bookingStatusHistory.findFirst({
      where: { companyId, bookingId: booking.id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    await tx.bookingStatusHistory.create({
      data: {
        companyId, bookingId: booking.id, sequence: (latest?.sequence ?? 0) + 1, actorId,
        fromStatus: 'Assigned', toStatus: 'Cancelled', reason: `Passenger no-show: ${data.reason}`,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'BOOKING_NO_SHOW', entityType: 'BOOKING', entityId: booking.id,
        summary: { bookingReference: booking.reference, tripId, reason: data.reason },
      },
    });
  });
  const manifest = await getTripManifest({ actorId, companyId, tripId });
  return { trip: manifest.trip, entries: manifest.entries };
}
