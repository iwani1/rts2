import { z } from 'zod';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';

export class OperationsCompanyNotFoundError extends Error {
  constructor() {
    super('Company not found.');
    this.name = 'OperationsCompanyNotFoundError';
  }
}

const companyIdSchema = z.string().trim().min(1).max(128);

const accraDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Today's date in Africa/Accra as `YYYY-MM-DD`. */
export function accraToday(now: Date = new Date()): string {
  return accraDate.format(now);
}

export function addDays(dateOnly: string, days: number): string {
  return new Date(new Date(`${dateOnly}T00:00:00.000Z`).valueOf() + days * 86_400_000)
    .toISOString().slice(0, 10);
}

/** Pure status bucketing for today's trips (unit-tested). */
export function bucketTripStatuses(statuses: string[]): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>();
  for (const status of statuses) counts.set(status, (counts.get(status) ?? 0) + 1);
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

export type OperationsDashboard = {
  companyId: string;
  today: string;
  tripsToday: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    unresourced: number;
    list: Array<{
      tripId: string;
      reference: string;
      status: string;
      plannedStartTime: string | null;
      clientName: string | null;
      routeName: string | null;
      vehicleRegistration: string | null;
      driverName: string | null;
      assignedBookings: number;
      needsVehicle: boolean;
      needsDriver: boolean;
    }>;
  };
  bookingQueues: {
    pendingTotal: number;
    pendingOldest: Array<{
      bookingId: string; reference: string; employeeName: string;
      journeyDate: string; bookingType: string; clientName: string;
    }>;
    acceptedUnassignedTotal: number;
    acceptedUnassignedNext: Array<{
      bookingId: string; reference: string; employeeName: string;
      journeyDate: string; bookingType: string; clientName: string;
    }>;
  };
  fleetAlerts: {
    activeSafetyBlocks: number;
    documents: {
      windowDays: 30;
      driverLicencesExpiring: number;
      driverLicencesExpired: number;
      vehicleInsuranceExpiring: number;
      vehicleInsuranceExpired: number;
      vehicleRoadworthinessExpiring: number;
      vehicleRoadworthinessExpired: number;
    };
  };
};

/**
 * D-067: the Operations Manager snapshot. Read-only and permission-scoped;
 * every figure is a direct count or list over governed records at request
 * time — nothing is estimated.
 */
export async function getOperationsDashboard(input: {
  actorId: string; companyId: string;
}): Promise<OperationsDashboard> {
  const companyId = companyIdSchema.parse(input.companyId);
  const [tripPermission, bookingPermission] = await Promise.all([
    resolvePermission({ userId: input.actorId, companyId, permission: 'trip:dispatch' }),
    resolvePermission({ userId: input.actorId, companyId, permission: 'booking:manage' }),
  ]);
  const allowed = [tripPermission, bookingPermission].some(
    (permission) => permission.allowed
      && (permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY')),
  );
  if (!allowed) throw new PermissionDeniedError();
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new OperationsCompanyNotFoundError();

  const today = accraToday();
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const windowEnd = new Date(`${addDays(today, 30)}T00:00:00.000Z`);

  const [
    trips, pendingTotal, pendingOldest, acceptedTotal, acceptedNext,
    activeSafetyBlocks,
    licencesExpiring, licencesExpired,
    insuranceExpiring, insuranceExpired,
    roadworthyExpiring, roadworthyExpired,
  ] = await Promise.all([
    prisma.trip.findMany({
      where: { companyId, tripDate: todayDate },
      orderBy: [{ plannedStartTime: 'asc' }, { reference: 'asc' }],
      take: 100,
      select: {
        id: true, reference: true, status: true, plannedStartTime: true,
        vehicleId: true, driverId: true,
        client: { select: { name: true } },
        route: { select: { name: true } },
        vehicle: { select: { registrationNumber: true } },
        driver: { select: { fullName: true } },
        _count: { select: { bookings: true } },
      },
    }),
    prisma.booking.count({ where: { companyId, status: 'Pending' } }),
    prisma.booking.findMany({
      where: { companyId, status: 'Pending' },
      orderBy: [{ journeyDate: 'asc' }, { createdAt: 'asc' }],
      take: 10,
      select: {
        id: true, reference: true, journeyDate: true, bookingType: true,
        employee: { select: { fullName: true } },
        client: { select: { name: true } },
      },
    }),
    prisma.booking.count({ where: { companyId, status: 'Accepted', tripId: null } }),
    prisma.booking.findMany({
      where: { companyId, status: 'Accepted', tripId: null },
      orderBy: [{ journeyDate: 'asc' }, { createdAt: 'asc' }],
      take: 10,
      select: {
        id: true, reference: true, journeyDate: true, bookingType: true,
        employee: { select: { fullName: true } },
        client: { select: { name: true } },
      },
    }),
    prisma.vehicleSafetyBlock.count({ where: { companyId, releasedAt: null } }),
    prisma.driver.count({
      where: { companyId, archivedAt: null, licenceExpiresAt: { gte: todayDate, lt: windowEnd } },
    }),
    prisma.driver.count({
      where: { companyId, archivedAt: null, licenceExpiresAt: { lt: todayDate } },
    }),
    prisma.vehicle.count({
      where: { companyId, archivedAt: null, insuranceExpiresAt: { gte: todayDate, lt: windowEnd } },
    }),
    prisma.vehicle.count({
      where: { companyId, archivedAt: null, insuranceExpiresAt: { lt: todayDate } },
    }),
    prisma.vehicle.count({
      where: { companyId, archivedAt: null, roadworthinessExpiresAt: { gte: todayDate, lt: windowEnd } },
    }),
    prisma.vehicle.count({
      where: { companyId, archivedAt: null, roadworthinessExpiresAt: { lt: todayDate } },
    }),
  ]);

  const queueItem = (row: (typeof pendingOldest)[number]) => ({
    bookingId: row.id,
    reference: row.reference,
    employeeName: row.employee.fullName,
    journeyDate: row.journeyDate.toISOString().slice(0, 10),
    bookingType: row.bookingType,
    clientName: row.client.name,
  });

  return {
    companyId,
    today,
    tripsToday: {
      total: trips.length,
      byStatus: bucketTripStatuses(trips.map((trip) => trip.status)),
      unresourced: trips.filter(
        (trip) => ['Planned', 'Ready for Dispatch'].includes(trip.status)
          && (trip.vehicleId === null || trip.driverId === null),
      ).length,
      list: trips.map((trip) => ({
        tripId: trip.id,
        reference: trip.reference,
        status: trip.status,
        plannedStartTime: trip.plannedStartTime,
        clientName: trip.client?.name ?? null,
        routeName: trip.route?.name ?? null,
        vehicleRegistration: trip.vehicle?.registrationNumber ?? null,
        driverName: trip.driver?.fullName ?? null,
        assignedBookings: trip._count.bookings,
        needsVehicle: trip.vehicleId === null,
        needsDriver: trip.driverId === null,
      })),
    },
    bookingQueues: {
      pendingTotal,
      pendingOldest: pendingOldest.map(queueItem),
      acceptedUnassignedTotal: acceptedTotal,
      acceptedUnassignedNext: acceptedNext.map(queueItem),
    },
    fleetAlerts: {
      activeSafetyBlocks,
      documents: {
        windowDays: 30,
        driverLicencesExpiring: licencesExpiring,
        driverLicencesExpired: licencesExpired,
        vehicleInsuranceExpiring: insuranceExpiring,
        vehicleInsuranceExpired: insuranceExpired,
        vehicleRoadworthinessExpiring: roadworthyExpiring,
        vehicleRoadworthinessExpired: roadworthyExpired,
      },
    },
  };
}
