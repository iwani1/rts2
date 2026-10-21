import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '@/server/prisma';
import { notifyLinkedEmployee } from '@/modules/notifications/notifications';
import { safetyStatusForVehicles } from '@/modules/maintenance/vehicle-safety-blocks';
import { applyVehicleSafetyBlock } from '@/modules/maintenance/vehicle-safety-blocks';
import { createWorkOrder } from '@/modules/maintenance/work-orders';
import { incidentReplacementSchema } from './incident-schema';
import {
  IncidentNotFoundError,
  IncidentValidationError,
  accessFor,
} from './incidents';

const companyIdSchema = z.string().trim().min(1).max(128);
const idSchema = z.string().trim().min(1).max(128);

export const ACTIVE_TRIP_STATUSES = [
  'Ready for Dispatch', 'Dispatched', 'In Progress', 'Delayed', 'Interrupted',
] as const;

export type AffectedTrip = {
  tripId: string;
  reference: string;
  status: string;
  tripDate: string;
  isIncidentTrip: boolean;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  driverId: string | null;
  driverName: string | null;
  passengerCount: number;
};

export type ReplacementVehicleOption = {
  vehicleId: string;
  registrationNumber: string;
  seatCount: number;
  fitsPassengers: boolean;
};

export type ReplacementDriverOption = {
  driverId: string;
  fullName: string;
  licenceExpiresAt: Date | null;
};

export type IncidentResponsePlan = {
  incidentId: string;
  incidentStatus: string;
  canConfirm: boolean;
  affectedTrips: AffectedTrip[];
  replacementVehicles: ReplacementVehicleOption[];
  replacementDrivers: ReplacementDriverOption[];
};

async function loadAffectedTrips(
  prisma: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  companyId: string,
  incident: { tripId: string | null; vehicleId: string | null; driverId: string | null },
): Promise<AffectedTrip[]> {
  if (!incident.tripId) return [];
  const primary = await prisma.trip.findFirst({
    where: { id: incident.tripId, companyId },
    select: {
      id: true, reference: true, status: true, tripDate: true, vehicleId: true, driverId: true,
      vehicle: { select: { registrationNumber: true } },
      driver: { select: { fullName: true } },
    },
  });
  if (!primary) return [];
  const related = await prisma.trip.findMany({
    where: {
      companyId,
      id: { not: primary.id },
      tripDate: primary.tripDate,
      status: { in: [...ACTIVE_TRIP_STATUSES] },
      OR: [
        ...(incident.vehicleId ? [{ vehicleId: incident.vehicleId }] : []),
        ...(incident.driverId ? [{ driverId: incident.driverId }] : []),
      ],
    },
    orderBy: [{ id: 'asc' }],
    select: {
      id: true, reference: true, status: true, tripDate: true, vehicleId: true, driverId: true,
      vehicle: { select: { registrationNumber: true } },
      driver: { select: { fullName: true } },
    },
  });
  const rows = [primary, ...related];
  const counts = await Promise.all(rows.map((trip) => prisma.booking.count({
    where: { companyId, tripId: trip.id, status: { in: ['Assigned', 'Boarded'] } },
  })));
  return rows.map((trip, index) => ({
    tripId: trip.id,
    reference: trip.reference,
    status: trip.status,
    tripDate: trip.tripDate.toISOString().slice(0, 10),
    isIncidentTrip: trip.id === primary.id,
    vehicleId: trip.vehicleId,
    vehicleRegistration: trip.vehicle?.registrationNumber ?? null,
    driverId: trip.driverId,
    driverName: trip.driver?.fullName ?? null,
    passengerCount: counts[index],
  }));
}

/**
 * INC-02 (D-072): who is affected, and which vehicles/drivers could take
 * over. Safety-blocked vehicles and licence-expired drivers never appear.
 */
export async function getIncidentResponsePlan(input: {
  actorId: string; companyId: string; incidentId: string;
}): Promise<IncidentResponsePlan> {
  const companyId = companyIdSchema.parse(input.companyId);
  const incidentId = idSchema.parse(input.incidentId);
  await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, companyId },
    select: { id: true, status: true, tripId: true, vehicleId: true, driverId: true },
  });
  if (!incident) throw new IncidentNotFoundError();
  const affectedTrips = await loadAffectedTrips(prisma, companyId, incident);
  const primary = affectedTrips.find((trip) => trip.isIncidentTrip) ?? null;
  const canConfirm = ['Open', 'Acknowledged', 'In Progress'].includes(incident.status)
    && primary !== null && ACTIVE_TRIP_STATUSES.includes(primary.status as typeof ACTIVE_TRIP_STATUSES[number]);

  let replacementVehicles: ReplacementVehicleOption[] = [];
  let replacementDrivers: ReplacementDriverOption[] = [];
  if (primary) {
    const dayTrips = await prisma.trip.findMany({
      where: {
        companyId, tripDate: new Date(`${primary.tripDate}T00:00:00.000Z`),
        status: { in: [...ACTIVE_TRIP_STATUSES] }, id: { not: primary.tripId },
      },
      select: { vehicleId: true, driverId: true },
    });
    const busyVehicleIds = new Set(dayTrips.map((trip) => trip.vehicleId).filter(Boolean));
    const busyDriverIds = new Set(dayTrips.map((trip) => trip.driverId).filter(Boolean));

    const vehicles = await prisma.vehicle.findMany({
      where: { companyId, archivedAt: null },
      orderBy: [{ seatCount: 'asc' }, { registrationNumber: 'asc' }],
      select: { id: true, registrationNumber: true, seatCount: true },
      take: 100,
    });
    const safety = await safetyStatusForVehicles(companyId, vehicles.map((vehicle) => vehicle.id));
    replacementVehicles = vehicles
      .filter((vehicle) => vehicle.id !== primary.vehicleId)
      .filter((vehicle) => !safety.has(vehicle.id) && !busyVehicleIds.has(vehicle.id))
      .map((vehicle) => ({
        vehicleId: vehicle.id,
        registrationNumber: vehicle.registrationNumber,
        seatCount: vehicle.seatCount ?? 0,
        fitsPassengers: (vehicle.seatCount ?? 0) >= primary.passengerCount && vehicle.seatCount !== null,
      }))
      .sort((a, b) => Number(b.fitsPassengers) - Number(a.fitsPassengers) || a.seatCount - b.seatCount);

    const today = new Date();
    const drivers = await prisma.driver.findMany({
      where: { companyId, archivedAt: null, status: 'ACTIVE' },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, licenceExpiresAt: true },
      take: 100,
    });
    replacementDrivers = drivers
      .filter((driver) => driver.id !== primary.driverId)
      .filter((driver) => !busyDriverIds.has(driver.id))
      .filter((driver) => driver.licenceExpiresAt === null || driver.licenceExpiresAt >= today)
      .map((driver) => ({
        driverId: driver.id,
        fullName: driver.fullName,
        licenceExpiresAt: driver.licenceExpiresAt,
      }));
  }

  return {
    incidentId: incident.id,
    incidentStatus: incident.status,
    canConfirm,
    affectedTrips,
    replacementVehicles,
    replacementDrivers,
  };
}

export type IncidentReplacementResult = {
  tripId: string;
  previousVehicleId: string | null;
  previousDriverId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  notifiedPassengers: number;
  safetyBlockApplied: boolean;
  workOrderReference: string | null;
  warnings: string[];
};

/**
 * INC-02 (D-072): confirm a replacement vehicle/driver on the incident's
 * active trip. Hard blocks refuse outright; overlap and seat shortfalls
 * need an override. Optional safety block and work order run afterwards
 * through the maintenance services and degrade to plain warnings.
 */
export async function confirmIncidentReplacement(
  input: unknown, actorId: string, companyIdInput: string, incidentIdInput: string,
): Promise<IncidentReplacementResult> {
  const data = incidentReplacementSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const incidentId = idSchema.parse(incidentIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();

  const outcome = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const incidentRows = await tx.$queryRaw<Array<{
      status: string; reference: string; tripId: string | null; description: string;
    }>>`
      SELECT "status", "reference", "tripId", "description" FROM "Incident"
      WHERE "id" = ${incidentId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const incident = incidentRows[0];
    if (!incident) throw new IncidentNotFoundError();
    if (!['Open', 'Acknowledged', 'In Progress'].includes(incident.status)) {
      throw new IncidentValidationError(
        `This incident is ${incident.status}; replacements can only be confirmed while it is open.`,
      );
    }
    if (incident.tripId !== data.tripId) {
      throw new IncidentValidationError('Replacements are confirmed on the trip attached to this incident.');
    }

    const tripRows = await tx.$queryRaw<Array<{
      status: string; reference: string; vehicleId: string | null; driverId: string | null;
      tripDate: Date; capacityLimit: number | null;
    }>>`
      SELECT "status", "reference", "vehicleId", "driverId", "tripDate", "capacityLimit" FROM "Trip"
      WHERE "id" = ${data.tripId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const trip = tripRows[0];
    if (!trip) throw new IncidentValidationError('Trip not found in this company.');
    if (!ACTIVE_TRIP_STATUSES.includes(trip.status as typeof ACTIVE_TRIP_STATUSES[number])) {
      throw new IncidentValidationError(
        `The trip is ${trip.status}; breakdown replacements apply while a trip is active.`,
      );
    }

    const passengerCount = await tx.booking.count({
      where: { companyId, tripId: data.tripId, status: { in: ['Assigned', 'Boarded'] } },
    });
    const conflicts: string[] = [];

    let nextVehicleId = trip.vehicleId;
    if (data.newVehicleId) {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: data.newVehicleId, companyId },
        select: { id: true, archivedAt: true, seatCount: true },
      });
      if (!vehicle) throw new IncidentValidationError('Replacement vehicle not found in this company.');
      if (vehicle.archivedAt) {
        throw new IncidentValidationError('That vehicle is archived and cannot be assigned.');
      }
      const block = await tx.vehicleSafetyBlock.findFirst({
        where: { companyId, vehicleId: vehicle.id, releasedAt: null },
        select: { id: true, status: true },
      });
      if (block) {
        throw new IncidentValidationError(
          `That vehicle is safety-blocked (${block.status}) and cannot be assigned until released.`,
        );
      }
      const overlap = await tx.trip.findFirst({
        where: {
          companyId, tripDate: trip.tripDate, vehicleId: vehicle.id,
          status: { in: [...ACTIVE_TRIP_STATUSES] }, id: { not: data.tripId },
        },
        select: { reference: true },
      });
      if (overlap) conflicts.push(`vehicle already committed to trip ${overlap.reference} that day`);
      if ((vehicle.seatCount ?? 0) < passengerCount) {
        conflicts.push(`vehicle has ${vehicle.seatCount ?? 0} seats for ${passengerCount} passengers`);
      }
      nextVehicleId = vehicle.id;
    }

    let nextDriverId = trip.driverId;
    if (data.newDriverId) {
      const driver = await tx.driver.findFirst({
        where: { id: data.newDriverId, companyId },
        select: { id: true, status: true, archivedAt: true, licenceExpiresAt: true },
      });
      if (!driver) throw new IncidentValidationError('Replacement driver not found in this company.');
      if (driver.archivedAt || driver.status !== 'ACTIVE') {
        throw new IncidentValidationError('That driver is not active and cannot be assigned.');
      }
      if (driver.licenceExpiresAt && driver.licenceExpiresAt < new Date()) {
        throw new IncidentValidationError('That driver\'s licence has expired and they cannot be assigned.');
      }
      const overlap = await tx.trip.findFirst({
        where: {
          companyId, tripDate: trip.tripDate, driverId: driver.id,
          status: { in: [...ACTIVE_TRIP_STATUSES] }, id: { not: data.tripId },
        },
        select: { reference: true },
      });
      if (overlap) conflicts.push(`driver already committed to trip ${overlap.reference} that day`);
      nextDriverId = driver.id;
    }

    if (conflicts.length > 0 && !data.override) {
      throw new IncidentValidationError(
        `This replacement has conflicts (${conflicts.join('; ')}). Confirm the override to proceed.`,
      );
    }

    const changed = await tx.trip.updateMany({
      where: { id: data.tripId, companyId, status: trip.status },
      data: { vehicleId: nextVehicleId, driverId: nextDriverId },
    });
    if (changed.count !== 1) throw new IncidentValidationError('The trip changed while confirming; try again.');

    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'INCIDENT_REPLACEMENT_CONFIRMED',
        entityType: 'INCIDENT', entityId: incidentId,
        summary: {
          incidentReference: incident.reference, tripId: data.tripId, tripReference: trip.reference,
          previousVehicleId: trip.vehicleId, previousDriverId: trip.driverId,
          newVehicleId: nextVehicleId, newDriverId: nextDriverId,
          override: data.override, conflicts, reason: data.reason,
        },
      },
    });

    const bookings = await tx.booking.findMany({
      where: { companyId, tripId: data.tripId, status: { in: ['Assigned', 'Boarded'] } },
      select: { id: true, employeeId: true },
    });
    let notifiedPassengers = 0;
    for (const booking of bookings) {
      const delivered = await notifyLinkedEmployee(tx, {
        companyId,
        employeeId: booking.employeeId,
        actorId,
        type: 'INCIDENT_REPLACEMENT_CONFIRMED',
        title: `Trip update (${trip.reference})`,
        body: 'There has been a change to your trip vehicle or driver because of a problem on the road. Please check with dispatch if you are unsure where to board.',
        entityType: 'INCIDENT',
        entityId: incidentId,
        dedupeKey: `incident:${incidentId}:replacement:${booking.id}:${nextVehicleId ?? 'same-vehicle'}:${nextDriverId ?? 'same-driver'}`,
      });
      if (delivered) notifiedPassengers += 1;
    }

    return {
      tripId: data.tripId,
      tripReference: trip.reference,
      description: incident.description,
      previousVehicleId: trip.vehicleId,
      previousDriverId: trip.driverId,
      vehicleId: nextVehicleId,
      driverId: nextDriverId,
      notifiedPassengers,
    };
  });

  const warnings: string[] = [];
  let safetyBlockApplied = false;
  let workOrderReference: string | null = null;
  if (data.blockOriginalVehicle && outcome.previousVehicleId
    && outcome.previousVehicleId !== outcome.vehicleId) {
    try {
      await applyVehicleSafetyBlock({
        actorId, companyId, vehicleId: outcome.previousVehicleId,
        status: 'Out of Service',
        reason: `Vehicle taken out of service after incident replacement (${data.reason})`,
      });
      safetyBlockApplied = true;
    } catch (error) {
      warnings.push(
        `The replacement was confirmed, but the original vehicle could not be safety-blocked: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
  if (data.createWorkOrder && outcome.previousVehicleId) {
    try {
      const workOrder = await createWorkOrder({
        actorId, companyId, vehicleId: outcome.previousVehicleId,
        reportedFault: outcome.description,
        dateReported: new Date().toISOString().slice(0, 10),
        safetyRelated: false,
        reason: `Raised from incident replacement (${data.reason})`,
      });
      workOrderReference = (workOrder as { reference?: string }).reference ?? null;
    } catch (error) {
      warnings.push(
        `The replacement was confirmed, but the maintenance work order could not be created: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  return {
    tripId: outcome.tripId,
    previousVehicleId: outcome.previousVehicleId,
    previousDriverId: outcome.previousDriverId,
    vehicleId: outcome.vehicleId,
    driverId: outcome.driverId,
    notifiedPassengers: outcome.notifiedPassengers,
    safetyBlockApplied,
    workOrderReference,
    warnings,
  };
}
