import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createLocation, listLocations } from './locations';
import { createRoute, getRoute, getRoutePlan, listRoutes, setRouteStops } from './routes';
import {
  RouteScheduleConflictError,
  copyRouteSchedule,
  createRouteSchedule,
  listRouteSchedules,
  setRouteScheduleActive,
} from './route-schedules';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let managerId = '';
let dispatcherId = '';
let clientId = '';
let originId = '';
let destinationId = '';
let stopId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

const locationInput = (name: string, overrides: Record<string, unknown> = {}) => ({
  name, latitude: null, longitude: null, landmarkDescription: 'Main gate', ghanaDigitalAddress: null,
  notes: null, reason: 'Integration test location entry', ...overrides,
});

const routeInput = (overrides: Record<string, unknown> = {}) => ({
  clientId, name: `Route ${randomUUID().slice(0, 8)}`, serviceType: 'Staff busing',
  originLocationId: originId, destinationLocationId: destinationId,
  plannedStartTime: '05:30', expectedDurationMinutes: 90, capacityRequirement: 30,
  operatingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'], shift: 'Morning', active: true, notes: null,
  reason: 'Integration test route entry', ...overrides,
});

describe('locations, routes and schedules with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, manager, dispatcher] = await Promise.all([
      prisma.company.create({ data: { name: `Routes ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other routes ${randomUUID()}` } }),
      makeUser('Route Ops Manager'),
      makeUser('Route Dispatcher'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    managerId = manager.id;
    dispatcherId = dispatcher.id;
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: dispatcherId, companyId, roleCode: 'DISPATCHER', reason: 'Integration setup', assignedById: null },
    });
    const client = await prisma.client.create({ data: { companyId, name: `Route Client ${randomUUID()}` } });
    clientId = client.id;
  });

  afterAll(async () => {
    // Integration tests run against a disposable *_test database; recreate it when a clean slate is needed.
    await prisma.$disconnect();
  });

  it('creates locations with optional coordinate pairs', async () => {
    const origin = await createLocation(locationInput(`Origin ${randomUUID().slice(0, 8)}`, { latitude: 5.6037, longitude: -0.187 }), managerId, companyId);
    const destination = await createLocation(locationInput(`Destination ${randomUUID().slice(0, 8)}`), managerId, companyId);
    const stop = await createLocation(locationInput(`Stop ${randomUUID().slice(0, 8)}`), managerId, companyId);
    originId = origin.id;
    destinationId = destination.id;
    stopId = stop.id;
    expect(Number(origin.latitude)).toBeCloseTo(5.6037);
    expect(destination.latitude).toBeNull();
    await expect(createLocation(locationInput('Half mapped', { latitude: 5.6 }), managerId, companyId)).rejects.toThrow();
  });

  it('creates a route, stores the approved stop order, and replaces it on override', async () => {
    const route = await createRoute(routeInput(), managerId, companyId);
    expect(route.reference).toMatch(/^RTE-[A-F0-9]{16}$/);
    const withStops = await setRouteStops({
      stops: [
        { locationId: stopId, stopKind: 'PICKUP', plannedOffsetMinutes: 10 },
        { locationId: destinationId, stopKind: 'DROPOFF', plannedOffsetMinutes: 80 },
      ],
      reason: 'Approved stop order from dispatch planning',
    }, dispatcherId, companyId, route.id);
    expect(withStops.stops.map((entry) => entry.sequence)).toEqual([1, 2]);
    const overridden = await setRouteStops({
      stops: [
        { locationId: destinationId, stopKind: 'DROPOFF', plannedOffsetMinutes: 80 },
        { locationId: stopId, stopKind: 'PICKUP', plannedOffsetMinutes: 10 },
      ],
      reason: 'Dispatcher override after road closure',
    }, managerId, companyId, route.id);
    expect(overridden.stops[0].locationId).toBe(destinationId);
    const detail = await getRoute({ actorId: managerId, companyId, routeId: route.id });
    expect(detail.route.stops).toHaveLength(2);
  });

  it('produces a manual plan with capacity assessment and unmapped-stop flags', async () => {
    const route = await createRoute(routeInput({ capacityRequirement: 30 }), managerId, companyId);
    await setRouteStops({
      stops: [{ locationId: stopId, stopKind: 'PICKUP', plannedOffsetMinutes: 15 }],
      reason: 'Approved stop order from dispatch planning',
    }, managerId, companyId, route.id);
    await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `GR-${randomUUID().slice(0, 8).toUpperCase()}`, make: 'Test', model: 'Bus',
        category: 'Bus', seatCount: 20,
      },
    });
    const { plan } = await getRoutePlan({ actorId: managerId, companyId, routeId: route.id });
    expect(plan.basis).toBe('MANUAL_APPROXIMATE');
    expect(plan.capacity.sufficient).toBe(false);
    expect(plan.legs[0].plannedArrivalTime).toBe('05:45');
    expect(plan.unmappedStops.length).toBeGreaterThan(0);
  });

  it('detects schedule conflicts, supports copy, and reactivates safely', async () => {
    const route = await createRoute(routeInput(), managerId, companyId);
    const recurring = await createRouteSchedule({
      kind: 'RECURRING', daysOfWeek: ['MON', 'TUE'], scheduleDate: null, shift: 'Morning',
      plannedStartTime: '05:30', notes: null, reason: 'Weekday schedule from contract',
    }, managerId, companyId, route.id);
    await expect(createRouteSchedule({
      kind: 'RECURRING', daysOfWeek: ['TUE', 'WED'], scheduleDate: null, shift: 'Morning',
      plannedStartTime: '05:30', notes: null, reason: 'Overlapping weekday schedule',
    }, managerId, companyId, route.id)).rejects.toBeInstanceOf(RouteScheduleConflictError);
    // A one-time schedule on a Tuesday at the same time also conflicts.
    await expect(createRouteSchedule({
      kind: 'ONE_TIME', daysOfWeek: [], scheduleDate: '2026-10-27', shift: null,
      plannedStartTime: '05:30', notes: null, reason: 'One-off Tuesday extra bus',
    }, managerId, companyId, route.id)).rejects.toBeInstanceOf(RouteScheduleConflictError);
    const oneTime = await createRouteSchedule({
      kind: 'ONE_TIME', daysOfWeek: [], scheduleDate: '2026-10-27', shift: null,
      plannedStartTime: '06:30', notes: null, reason: 'One-off Tuesday extra bus',
    }, managerId, companyId, route.id);
    const copy = await copyRouteSchedule(
      { scheduleDate: '2026-10-28', reason: 'Copying the extra bus to Wednesday' },
      managerId, companyId, oneTime.id,
    );
    expect(copy.scheduleDate).toBe('2026-10-28');
    await setRouteScheduleActive({ active: false, reason: 'Pausing the copied extra bus' }, managerId, companyId, copy.id);
    const reactivated = await setRouteScheduleActive({ active: true, reason: 'Resuming the copied extra bus' }, managerId, companyId, copy.id);
    expect(reactivated.active).toBe(true);
    const schedules = await listRouteSchedules({ actorId: dispatcherId, companyId, routeId: route.id });
    expect(schedules.schedules.length).toBeGreaterThanOrEqual(3);
    expect(recurring.kind).toBe('RECURRING');
  });

  it('denies cross-company access for locations and routes', async () => {
    await expect(listLocations({ actorId: managerId, companyId: otherCompanyId })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(listRoutes({ actorId: managerId, companyId: otherCompanyId })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(createRoute(routeInput({ clientId: 'missing-client' }), managerId, companyId)).rejects.toThrow();
  });
});
