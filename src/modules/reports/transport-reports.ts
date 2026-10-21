import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { reportQuerySchema, reportWindow, type ReportQuery } from './report-schema';
import { seatUtilisation, summarisePickupDelays } from './report-math';
import { getOnTimeThresholdMinutes } from '@/modules/settings/registry';

const companyIdSchema = z.string().trim().min(1).max(128);

export class ReportCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'ReportCompanyNotFoundError'; }
}

export const TRANSPORT_SCOPES = ['GLOBAL', 'OPERATIONAL', 'DISPATCH_SCOPE', 'FLEET_SCOPE'] as const;
export const FINANCE_SCOPES = ['GLOBAL', 'FINANCE_SCOPE'] as const;

export async function assertReportAccess(
  actorId: string, companyId: string, scopes: readonly string[],
) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'report:export' });
  if (!permission.allowed || !permission.scopes.some((scope) => scopes.includes(scope))) {
    throw new PermissionDeniedError();
  }
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new ReportCompanyNotFoundError();
}

export type TransportReport = {
  generatedAt: string;
  window: { fromDate: string | null; toDate: string | null };
  filters: {
    clientId: string | null; routeId: string | null; driverId: string | null;
    vehicleId: string | null; serviceType: string | null; status: string | null;
  };
  bookings: {
    received: number; confirmed: number; boarded: number; completed: number;
    cancelled: number; rejected: number; noShows: number; passengersTransported: number;
  };
  pickups: {
    onTimeRate: number | null;
    onTimeStatus: 'OK' | 'INSUFFICIENT_DATA';
    onTimeReason: string;
    thresholdMinutes: number | null;
    eligibleBoardedPickups: number;
    pickupsWithPlannedAndActual: number;
    latePickups: number;
    onTimeOrEarlyPickups: number;
    averageDelayAllMinutes: number | null;
    averageDelayLateOnlyMinutes: number | null;
  };
  trips: { byStatus: Array<{ status: string; count: number }>; completedTrips: number };
  routeUtilisation: {
    occupiedSeats: number;
    capacitySeats: number;
    utilisation: number | null;
    excludedCompletedTrips: number;
    routes: Array<{
      routeId: string | null; routeLabel: string; trips: number;
      occupiedSeats: number; capacitySeats: number; utilisation: number | null;
    }>;
  };
  fleet: {
    totalVehicles: number;
    archivedVehicles: number;
    byCategory: Array<{ category: string; count: number }>;
    activeSafetyBlocks: Array<{ status: string; count: number }>;
  };
  documentExpiry: {
    asOf: string;
    documents: Array<{ document: string; expiringInWindow: number | null; alreadyExpired: number }>;
  };
  maintenance: {
    byStatus: Array<{ status: string; count: number }>;
    workOrdersInScope: number;
    withCompleteCostData: number;
    withAnyCostData: number;
    recordedCostPesewas: number;
  };
  unavailableMetrics: Array<{ metric: string; reason: string }>;
};

const UNAVAILABLE: Array<{ metric: string; reason: string }> = [
  {
    metric: 'Vehicle downtime',
    reason: 'Vehicles have no persisted operational status history, so downtime durations cannot be derived without inventing status periods.',
  },
  {
    metric: 'Fuel cost and mileage',
    reason: 'No fuel transaction records exist, and odometer readings exist only as occasional maintenance snapshots; neither supports a cost or mileage series.',
  },
  {
    metric: 'Contract performance',
    reason: 'Service-level measures need agreed targets, denominators and periods per contract (docs/KPIS.md); none are defined yet.',
  },
];

function timeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * RPT-02 / D-064: staff-transport and fleet report. Booking flow is counted
 * from status-history event timestamps (distinct bookings per transition);
 * pickup delay compares BOARD history timestamps with the trip's planned
 * start; utilisation uses Completed trips carrying both a capacity and a
 * manifest. Records lacking the timestamps a metric needs are excluded from
 * that metric and counted in its coverage, never estimated.
 */
export async function getTransportReport(input: {
  actorId: string; companyId: string;
} & ReportQuery): Promise<TransportReport> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = reportQuerySchema.parse({
    fromDate: input.fromDate, toDate: input.toDate, clientId: input.clientId,
    routeId: input.routeId, driverId: input.driverId, vehicleId: input.vehicleId,
    serviceType: input.serviceType, status: input.status,
  });
  await assertReportAccess(input.actorId, companyId, TRANSPORT_SCOPES);
  const prisma = getPrisma();
  const window = reportWindow(query);

  const bookingScope: Prisma.BookingWhereInput = {
    companyId,
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.routeId ? { routeId: query.routeId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.driverId || query.vehicleId ? {
      trip: {
        ...(query.driverId ? { driverId: query.driverId } : {}),
        ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      },
    } : {}),
  };
  const historyScope: Prisma.BookingStatusHistoryWhereInput = {
    companyId,
    ...(window.dateTimeFilter ? { createdAt: window.dateTimeFilter } : {}),
    booking: bookingScope,
  };
  const tripScope: Prisma.TripWhereInput = {
    companyId,
    ...(window.dateFilter ? { tripDate: window.dateFilter } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.routeId ? { routeId: query.routeId } : {}),
    ...(query.driverId ? { driverId: query.driverId } : {}),
    ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
    ...(query.serviceType ? { serviceType: query.serviceType } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const distinctBookings = async (where: Prisma.BookingStatusHistoryWhereInput) => {
    const rows = await prisma.bookingStatusHistory.findMany({
      where, distinct: ['bookingId'], select: { bookingId: true },
    });
    return rows.length;
  };

  const [
    received, confirmed, boarded, completed, cancelled, rejected, noShows,
    tripStatusGroups, completedTrips, boardedHistory, categoryGroups, archivedVehicles,
    safetyBlocks, maintenanceStatusGroups, maintenanceCosts,
  ] = await Promise.all([
    distinctBookings({ ...historyScope, toStatus: 'Pending' }),
    distinctBookings({ ...historyScope, toStatus: 'Accepted' }),
    distinctBookings({ ...historyScope, toStatus: 'Boarded' }),
    distinctBookings({ ...historyScope, toStatus: 'Completed' }),
    distinctBookings({ ...historyScope, toStatus: 'Cancelled' }),
    distinctBookings({ ...historyScope, toStatus: 'Rejected' }),
    distinctBookings({ ...historyScope, toStatus: 'Cancelled', reason: { startsWith: 'Passenger no-show' } }),
    prisma.trip.groupBy({ by: ['status'], where: tripScope, _count: { _all: true } }),
    prisma.trip.findMany({
      where: { ...tripScope, status: 'Completed' },
      select: {
        id: true, routeId: true, capacityLimit: true,
        route: { select: { reference: true, name: true } },
        _count: {
          select: {
            bookings: { where: { status: { in: ['Assigned', 'Boarded', 'Completed'] } } },
          },
        },
      },
    }),
    prisma.bookingStatusHistory.findMany({
      where: { ...historyScope, toStatus: 'Boarded' },
      select: {
        bookingId: true, createdAt: true,
        booking: { select: { trip: { select: { tripDate: true, plannedStartTime: true } } } },
      },
    }),
    prisma.vehicle.groupBy({
      by: ['category'],
      where: { companyId, archivedAt: null, ...(query.vehicleId ? { id: query.vehicleId } : {}) },
      _count: { _all: true },
    }),
    prisma.vehicle.count({ where: { companyId, archivedAt: { not: null } } }),
    prisma.vehicleSafetyBlock.groupBy({
      by: ['status'],
      where: { companyId, releasedAt: null, ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}) },
      _count: { _all: true },
    }),
    prisma.maintenanceWorkOrder.groupBy({
      by: ['status'],
      where: {
        companyId,
        ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
        ...(window.dateFilter ? { dateReported: window.dateFilter } : {}),
      },
      _count: { _all: true },
    }),
    prisma.maintenanceWorkOrder.findMany({
      where: {
        companyId,
        ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
        ...(window.dateFilter ? { dateReported: window.dateFilter } : {}),
      },
      select: { labourCostPesewas: true, partsCostPesewas: true, otherCostPesewas: true },
    }),
  ]);

  // --- Route utilisation (Completed trips with capacity + manifest only). ---
  let occupiedSeats = 0;
  let capacitySeats = 0;
  let excludedCompletedTrips = 0;
  const routeMap = new Map<string, {
    routeId: string | null; routeLabel: string; trips: number; occupiedSeats: number; capacitySeats: number;
  }>();
  for (const trip of completedTrips as Array<{
    routeId: string | null; capacityLimit: number | null;
    route: { reference: string; name: string } | null; _count: { bookings: number };
  }>) {
    const manifest = trip._count.bookings;
    if (!trip.capacityLimit || trip.capacityLimit <= 0 || manifest === 0) {
      excludedCompletedTrips += 1;
      continue;
    }
    occupiedSeats += manifest;
    capacitySeats += trip.capacityLimit;
    const key = trip.routeId ?? 'none';
    const entry = routeMap.get(key) ?? {
      routeId: trip.routeId,
      routeLabel: trip.route ? `${trip.route.reference} — ${trip.route.name}` : 'No route recorded',
      trips: 0, occupiedSeats: 0, capacitySeats: 0,
    };
    entry.trips += 1;
    entry.occupiedSeats += manifest;
    entry.capacitySeats += trip.capacityLimit;
    routeMap.set(key, entry);
  }
  const routes = [...routeMap.values()]
    .map((entry) => ({ ...entry, utilisation: seatUtilisation(entry.occupiedSeats, entry.capacitySeats) }))
    .sort((a, b) => b.trips - a.trips || a.routeLabel.localeCompare(b.routeLabel));

  // --- Pickup delay samples (BOARD history time vs planned trip start). ---
  const delays: number[] = [];
  let eligibleBoardedPickups = 0;
  for (const row of boardedHistory as Array<{
    bookingId: string; createdAt: Date;
    booking: { trip: { tripDate: Date; plannedStartTime: string | null } | null };
  }>) {
    eligibleBoardedPickups += 1;
    const trip = row.booking.trip;
    const plannedMinutes = timeToMinutes(trip?.plannedStartTime ?? null);
    if (!trip || plannedMinutes === null) continue;
    const planned = new Date(trip.tripDate);
    planned.setUTCMinutes(plannedMinutes);
    delays.push((row.createdAt.getTime() - planned.getTime()) / 60_000);
  }
  const thresholdMinutes = await getOnTimeThresholdMinutes(companyId);
  const delaySummary = summarisePickupDelays(delays, thresholdMinutes);
  const onTimeRate = thresholdMinutes !== null && delaySummary.sampleSize > 0
    ? Math.round((delaySummary.onTimeOrEarlyPickups / delaySummary.sampleSize) * 10_000) / 10_000
    : null;

  // --- Document expiry (vehicle date fields + driver licences). ---
  const asOfDate = query.toDate ?? new Date().toISOString().slice(0, 10);
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`);
  const expiryFor = async (
    count: (where: Record<string, unknown>) => Promise<number>,
    field: string,
    extra: Record<string, unknown>,
  ) => {
    const base: Record<string, unknown> = { companyId, archivedAt: null, ...extra };
    const expiringInWindow = window.start && window.endExclusive
      ? await count({ ...base, [field]: { gte: window.start, lt: window.endExclusive } })
      : null;
    const alreadyExpired = await count({ ...base, [field]: { lt: asOf } });
    return { expiringInWindow, alreadyExpired };
  };
  const vehicleCount = (where: Record<string, unknown>) => prisma.vehicle.count({
    where: where as Prisma.VehicleWhereInput,
  });
  const driverCount = (where: Record<string, unknown>) => prisma.driver.count({
    where: where as Prisma.DriverWhereInput,
  });
  const vehicleScope = query.vehicleId ? { id: query.vehicleId } : {};
  const [insurance, roadworthiness, registration, licences] = await Promise.all([
    expiryFor(vehicleCount, 'insuranceExpiresAt', vehicleScope),
    expiryFor(vehicleCount, 'roadworthinessExpiresAt', vehicleScope),
    expiryFor(vehicleCount, 'registrationExpiresAt', vehicleScope),
    expiryFor(driverCount, 'licenceExpiresAt', query.driverId ? { id: query.driverId } : {}),
  ]);

  // --- Maintenance recorded costs (BigInt pesewas -> number). ---
  let withCompleteCostData = 0;
  let withAnyCostData = 0;
  let recordedCostPesewas = 0;
  for (const order of maintenanceCosts as Array<{
    labourCostPesewas: bigint | null; partsCostPesewas: bigint | null; otherCostPesewas: bigint | null;
  }>) {
    const parts = [order.labourCostPesewas, order.partsCostPesewas, order.otherCostPesewas];
    if (parts.every((value) => value !== null)) withCompleteCostData += 1;
    if (parts.some((value) => value !== null)) {
      withAnyCostData += 1;
      recordedCostPesewas += parts.reduce((sum: number, value) => sum + Number(value ?? BigInt(0)), 0);
    }
  }

  const byStatus = (tripStatusGroups as Array<{ status: string; _count: { _all: number } }>)
    .map((row) => ({ status: row.status, count: row._count._all }))
    .sort((a, b) => a.status.localeCompare(b.status));

  return {
    generatedAt: new Date().toISOString(),
    window: { fromDate: query.fromDate ?? null, toDate: query.toDate ?? null },
    filters: {
      clientId: query.clientId ?? null, routeId: query.routeId ?? null,
      driverId: query.driverId ?? null, vehicleId: query.vehicleId ?? null,
      serviceType: query.serviceType ?? null, status: query.status ?? null,
    },
    bookings: {
      received, confirmed, boarded, completed, cancelled, rejected, noShows,
      passengersTransported: completed,
    },
    pickups: {
      onTimeRate,
      onTimeStatus: onTimeRate !== null ? 'OK' : 'INSUFFICIENT_DATA',
      onTimeReason: thresholdMinutes === null
        ? 'The on-time threshold in minutes is still an unset owner policy; no rate is published until it is set.'
        : onTimeRate === null
          ? `The on-time threshold is set to ${thresholdMinutes} minutes, but no boarded pickups in scope have both planned and actual times.`
          : `Boarded within ${thresholdMinutes} minutes of the planned start counts as on time (owner policy, D-078).`,
      thresholdMinutes,
      eligibleBoardedPickups,
      pickupsWithPlannedAndActual: delaySummary.sampleSize,
      latePickups: delaySummary.latePickups,
      onTimeOrEarlyPickups: delaySummary.onTimeOrEarlyPickups,
      averageDelayAllMinutes: delaySummary.averageDelayAllMinutes,
      averageDelayLateOnlyMinutes: delaySummary.averageDelayLateOnlyMinutes,
    },
    trips: {
      byStatus,
      completedTrips: byStatus.find((row) => row.status === 'Completed')?.count ?? 0,
    },
    routeUtilisation: {
      occupiedSeats, capacitySeats,
      utilisation: seatUtilisation(occupiedSeats, capacitySeats),
      excludedCompletedTrips,
      routes,
    },
    fleet: {
      totalVehicles: (categoryGroups as Array<{ _count: { _all: number } }>)
        .reduce((sum, row) => sum + row._count._all, 0),
      archivedVehicles,
      byCategory: (categoryGroups as Array<{ category: string; _count: { _all: number } }>)
        .map((row) => ({ category: row.category, count: row._count._all }))
        .sort((a, b) => a.category.localeCompare(b.category)),
      activeSafetyBlocks: (safetyBlocks as Array<{ status: string; _count: { _all: number } }>)
        .map((row) => ({ status: row.status, count: row._count._all })),
    },
    documentExpiry: {
      asOf: asOfDate,
      documents: [
        { document: 'Vehicle insurance', ...insurance },
        { document: 'Vehicle roadworthiness', ...roadworthiness },
        { document: 'Vehicle registration', ...registration },
        { document: 'Driver licences', ...licences },
      ],
    },
    maintenance: {
      byStatus: (maintenanceStatusGroups as Array<{ status: string; _count: { _all: number } }>)
        .map((row) => ({ status: row.status, count: row._count._all }))
        .sort((a, b) => a.status.localeCompare(b.status)),
      workOrdersInScope: (maintenanceCosts as unknown[]).length,
      withCompleteCostData,
      withAnyCostData,
      recordedCostPesewas,
    },
    unavailableMetrics: onTimeRate !== null
      ? UNAVAILABLE
      : [
          {
            metric: 'On-time pickup rate',
            reason: thresholdMinutes === null
              ? 'The on-time threshold in minutes is still an unset owner policy (docs/KPIS.md), so no rate is published. Average delay and pickup coverage are reported instead.'
              : 'The on-time threshold is set, but no boarded pickups in scope have both planned and actual times, so no rate can be computed.',
          },
          ...UNAVAILABLE,
        ],
  };
}
