import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';

/**
 * GPS-01 (D-077): provider interface before any vendor. Nothing here ever
 * fabricates a coordinate; without configuration the honest state is
 * "Not configured".
 */

export const LOCATION_SOURCES = ['GPS_DEVICE', 'DRIVER_PHONE', 'SIMULATED'] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

export type NormalisedLocationReport = {
  /** Vehicle registration number as reported by the device/phone. */
  vehicleReference: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  source: LocationSource;
  recordedAt: Date;
};

export interface GpsProvider {
  readonly name: string;
  parseReport(payload: unknown): NormalisedLocationReport;
}

const genericReportSchema = z.object({
  registrationNumber: z.string().trim().min(1).max(32),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().int().nonnegative().max(100_000).nullable().optional(),
  source: z.enum(LOCATION_SOURCES).optional(),
  recordedAt: z.string().datetime({ offset: true }),
}).strict();

/** The documented generic JSON shape any device vendor or phone app can post. */
export function createGenericGpsProvider(): GpsProvider {
  return {
    name: 'generic',
    parseReport(payload: unknown): NormalisedLocationReport {
      const data = genericReportSchema.parse(payload);
      return {
        vehicleReference: data.registrationNumber.toUpperCase(),
        latitude: data.latitude,
        longitude: data.longitude,
        accuracyMeters: data.accuracyMeters ?? null,
        source: data.source ?? 'GPS_DEVICE',
        recordedAt: new Date(data.recordedAt),
      };
    },
  };
}

export type GpsConfiguration = {
  configured: boolean;
  providerName: string | null;
};

export function gpsConfiguration(env: Record<string, string | undefined> = process.env): GpsConfiguration {
  const provider = (env.GPS_PROVIDER ?? '').trim().toLowerCase();
  const secret = (env.GPS_WEBHOOK_SECRET ?? '').trim();
  if (provider === 'generic' && secret.length >= 16) {
    return { configured: true, providerName: 'generic' };
  }
  return { configured: false, providerName: null };
}

export function getGpsProvider(env: Record<string, string | undefined> = process.env): GpsProvider | null {
  return gpsConfiguration(env).configured ? createGenericGpsProvider() : null;
}

function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected || expected.trim().length < 16) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected.trim()).digest();
  return timingSafeEqual(a, b);
}

export class GpsNotConfiguredError extends Error {
  constructor() { super('GPS tracking is not configured.'); this.name = 'GpsNotConfiguredError'; }
}
export class GpsWebhookAuthError extends Error {
  constructor() { super('Webhook authentication failed.'); this.name = 'GpsWebhookAuthError'; }
}
export class GpsValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'GpsValidationError'; }
}
export class GpsOutsideOperationalPeriodError extends GpsValidationError {
  constructor() {
    super('That vehicle is not on an active trip. Locations are only tracked during authorised operational periods.');
    this.name = 'GpsOutsideOperationalPeriodError';
  }
}

const ACTIVE_TRIP_STATUSES = ['Dispatched', 'In Progress', 'Delayed', 'Interrupted'];

/**
 * Accepts one provider report. Tracking only during authorised operational
 * periods (D-077): the vehicle must be on an active trip right now, and the
 * report is stamped with that trip.
 */
export async function ingestLocationReport(input: {
  payload: unknown;
  webhookSecret: string | null;
  provider?: GpsProvider | null;
  env?: Record<string, string | undefined>;
}) {
  const env = input.env ?? process.env;
  const provider = input.provider === undefined ? getGpsProvider(env) : input.provider;
  if (!provider) throw new GpsNotConfiguredError();
  if (!secretMatches(input.webhookSecret, env.GPS_WEBHOOK_SECRET)) throw new GpsWebhookAuthError();
  const report = provider.parseReport(input.payload);
  const prisma = getPrisma();

  const vehicle = await prisma.vehicle.findFirst({
    where: { registrationNumber: report.vehicleReference, archivedAt: null },
    select: { id: true, companyId: true },
  });
  if (!vehicle) throw new GpsValidationError('No active vehicle matches that registration number.');

  const activeTrip = await prisma.trip.findFirst({
    where: {
      companyId: vehicle.companyId, vehicleId: vehicle.id,
      status: { in: ACTIVE_TRIP_STATUSES },
    },
    orderBy: [{ tripDate: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  if (!activeTrip) {
    throw new GpsOutsideOperationalPeriodError();
  }

  const row = await prisma.vehicleLocationReport.create({
    data: {
      companyId: vehicle.companyId,
      vehicleId: vehicle.id,
      tripId: activeTrip.id,
      latitude: report.latitude,
      longitude: report.longitude,
      accuracyMeters: report.accuracyMeters,
      source: report.source,
      recordedAt: report.recordedAt,
    },
  });
  return { reportId: row.id, vehicleId: vehicle.id, tripId: activeTrip.id };
}

export type LocationFreshness = 'LIVE' | 'STALE' | 'SIMULATED' | 'NONE';

export const LIVE_THRESHOLD_MINUTES = 5;

/** Live/stale/simulated classification (D-077). Exported for unit tests. */
export function classifyFreshness(input: {
  source: string | null;
  recordedAt: Date | null;
  now: Date;
}): LocationFreshness {
  if (!input.recordedAt) return 'NONE';
  if (input.source === 'SIMULATED') return 'SIMULATED';
  const ageMinutes = (input.now.getTime() - input.recordedAt.getTime()) / 60_000;
  return ageMinutes <= LIVE_THRESHOLD_MINUTES ? 'LIVE' : 'STALE';
}

async function accessFor(actorId: string, companyId: string) {
  for (const permission of ['fleet:manage', 'trip:manage'] as const) {
    const access = await resolvePermission({ userId: actorId, companyId, permission });
    if (access.allowed && (access.scopes.includes('GLOBAL') || access.scopes.includes('COMPANY'))) {
      const company = await getPrisma().company.findUnique({
        where: { id: companyId }, select: { status: true },
      });
      if (company?.status !== 'ACTIVE') throw new GpsValidationError('Company not found.');
      return;
    }
  }
  throw new PermissionDeniedError();
}

const companyIdSchema = z.string().trim().min(1).max(128);
const idSchema = z.string().trim().min(1).max(128);

export type VehicleLocationSummary = {
  vehicleId: string;
  registrationNumber: string;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  recordedAt: Date | null;
  freshness: LocationFreshness;
  tripReference: string | null;
};

/** Latest known position per vehicle (restricted — D-077). */
export async function listVehicleLocations(input: { actorId: string; companyId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const vehicles = await prisma.vehicle.findMany({
    where: { companyId, archivedAt: null },
    orderBy: { registrationNumber: 'asc' },
    take: 200,
    select: { id: true, registrationNumber: true },
  });
  const now = new Date();
  const summaries: VehicleLocationSummary[] = [];
  for (const vehicle of vehicles) {
    const latest = await prisma.vehicleLocationReport.findFirst({
      where: { companyId, vehicleId: vehicle.id },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      select: {
        latitude: true, longitude: true, source: true, recordedAt: true,
        trip: { select: { reference: true } },
      },
    });
    summaries.push({
      vehicleId: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      latitude: latest ? Number(latest.latitude) : null,
      longitude: latest ? Number(latest.longitude) : null,
      source: latest?.source ?? null,
      recordedAt: latest?.recordedAt ?? null,
      freshness: classifyFreshness({
        source: latest?.source ?? null, recordedAt: latest?.recordedAt ?? null, now,
      }),
      tripReference: latest?.trip?.reference ?? null,
    });
  }
  return { configuration: gpsConfiguration(), vehicles: summaries };
}

/** Restricted position history for one vehicle, newest first. */
export async function listVehicleLocationHistory(input: {
  actorId: string; companyId: string; vehicleId: string;
}) {
  const companyId = companyIdSchema.parse(input.companyId);
  const vehicleId = idSchema.parse(input.vehicleId);
  await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const rows = await prisma.vehicleLocationReport.findMany({
    where: { companyId, vehicleId },
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    take: 200,
    select: {
      id: true, latitude: true, longitude: true, accuracyMeters: true,
      source: true, recordedAt: true, receivedAt: true,
      trip: { select: { reference: true } },
    },
  });
  return rows.map((row) => ({
    reportId: row.id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: row.accuracyMeters,
    source: row.source,
    recordedAt: row.recordedAt,
    receivedAt: row.receivedAt,
    tripReference: row.trip?.reference ?? null,
  }));
}

/** Retention: 90 days (D-077). Explicit, audited — no hidden scheduler. */
export const LOCATION_RETENTION_DAYS = 90;

export async function purgeOldVehicleLocations(input: { actorId: string; companyId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - LOCATION_RETENTION_DAYS * 86_400_000);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL richie.location_purge = 'on'`;
    const result = await tx.$executeRaw`
      DELETE FROM "VehicleLocationReport"
      WHERE "companyId" = ${companyId} AND "recordedAt" < ${cutoff}
    `;
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId, companyId, action: 'VEHICLE_LOCATIONS_PURGED',
        entityType: 'COMPANY', entityId: companyId,
        summary: { deleted: result, retentionDays: LOCATION_RETENTION_DAYS },
      },
    });
    return { deleted: result };
  });
}
