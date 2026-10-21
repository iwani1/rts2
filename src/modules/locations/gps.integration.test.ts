import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createContract, transitionContract } from '../contracts/contracts';
import { createTrip, transitionTrip } from '../trips/trips';
import {
  GpsNotConfiguredError,
  GpsOutsideOperationalPeriodError,
  GpsWebhookAuthError,
  ingestLocationReport,
  listVehicleLocations,
  purgeOldVehicleLocations,
} from './gps';

const prisma = getPrisma();
const DAY = '2027-08-05';
const SECRET = 'integration-webhook-secret';
let companyId = '';
let opsId = '';
let vehicleId = '';
let registration = '';
let tripId = '';

const env = { GPS_PROVIDER: 'generic', GPS_WEBHOOK_SECRET: 'integration-webhook-secret' };

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `gps01-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    registrationNumber: registration,
    latitude: 5.6037,
    longitude: -0.187,
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('GPS provider intake and locations (GPS-01 / D-077)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const company = await prisma.company.create({ data: { name: `GPS ${randomUUID()}` } });
    companyId = company.id;
    const ops = await makeUser('GPS Ops');
    opsId = ops.id;
    await prisma.userRoleAssignment.create({
      data: { userId: opsId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    const client = await prisma.client.create({ data: { companyId, name: `GPS Client ${randomUUID()}` } });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'GPS test contract fixture',
    }, opsId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, opsId, companyId, draft.id);
    await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, opsId, companyId, draft.id);
    const [origin, destination] = await Promise.all([
      prisma.location.create({ data: { companyId, name: 'Depot' } }),
      prisma.location.create({ data: { companyId, name: 'Client HQ' } }),
    ]);
    const route = await prisma.route.create({
      data: {
        companyId, clientId: client.id, name: 'Morning inbound', reference: `RTE-${randomUUID().slice(0, 12).toUpperCase()}`, operatingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        originLocationId: origin.id, destinationLocationId: destination.id, capacityRequirement: 40, active: true,
      },
    });
    registration = `GPS-${randomUUID().slice(0, 8).toUpperCase()}`;
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: registration,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
      },
    });
    vehicleId = vehicle.id;
    const driver = await prisma.driver.create({ data: { companyId, fullName: 'GPS Driver', status: 'ACTIVE' } });
    const trip = await createTrip({
      clientId: client.id, routeId: route.id, serviceType: null, tripDate: DAY, plannedStartTime: null,
      plannedDurationMinutes: null, capacityLimit: 40, reason: 'GPS fixture trip',
    }, opsId, companyId);
    tripId = trip.id;
    await prisma.trip.update({ where: { id: tripId }, data: { vehicleId, driverId: driver.id } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('refuses when not configured and when the secret is wrong', async () => {
    await expect(ingestLocationReport({ payload: payload(), webhookSecret: SECRET, env: {} }))
      .rejects.toBeInstanceOf(GpsNotConfiguredError);
    await expect(ingestLocationReport({ payload: payload(), webhookSecret: 'wrong-secret-value', env }))
      .rejects.toBeInstanceOf(GpsWebhookAuthError);
  });

  it('refuses reports outside an authorised operational period', async () => {
    await expect(ingestLocationReport({ payload: payload(), webhookSecret: SECRET, env }))
      .rejects.toBeInstanceOf(GpsOutsideOperationalPeriodError);
    const rows = await prisma.vehicleLocationReport.count({ where: { companyId } });
    expect(rows).toBe(0);
  });

  it('accepts live and simulated reports on an active trip and classifies them honestly', async () => {
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing trip for dispatch' }, opsId, companyId, tripId);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Vehicle leaving the depot now' }, opsId, companyId, tripId);

    const live = await ingestLocationReport({ payload: payload(), webhookSecret: SECRET, env });
    expect(live.tripId).toBe(tripId);
    const simulated = await ingestLocationReport({
      payload: payload({ source: 'SIMULATED', latitude: 5.65, longitude: -0.19 }),
      webhookSecret: SECRET, env,
    });
    expect(simulated.vehicleId).toBe(vehicleId);

    const { vehicles } = await listVehicleLocations({ actorId: opsId, companyId });
    const row = vehicles.find((entry) => entry.vehicleId === vehicleId);
    // The latest report is the simulated one; it must be labelled simulated.
    expect(row?.freshness).toBe('SIMULATED');
    expect(row?.latitude).toBeCloseTo(5.65);
  });

  it('keeps history append-only while the audited purge still works', async () => {
    const report = await prisma.vehicleLocationReport.findFirstOrThrow({ where: { companyId } });
    await expect(prisma.vehicleLocationReport.update({
      where: { id: report.id }, data: { latitude: 1 },
    })).rejects.toThrow();
    await expect(prisma.vehicleLocationReport.delete({ where: { id: report.id } })).rejects.toThrow();

    const old = await prisma.vehicleLocationReport.create({
      data: {
        companyId, vehicleId, tripId, latitude: 5.6, longitude: -0.18,
        source: 'GPS_DEVICE', recordedAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
    const result = await purgeOldVehicleLocations({ actorId: opsId, companyId });
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.vehicleLocationReport.findUnique({ where: { id: old.id } })).toBeNull();
  });
});
