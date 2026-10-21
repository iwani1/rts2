import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { createTrip } from '../trips/trips';
import { accraToday, getOperationsDashboard } from './dashboard';

const prisma = getPrisma();
let companyId = '';
let opsId = '';
let passengerId = '';

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `ops-dash-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

async function assignRole(userId: string, roleCode: string) {
  await prisma.userRoleAssignment.create({
    data: { userId, companyId, roleCode, reason: 'Integration setup', assignedById: null },
  });
}

describe('operations dashboard snapshot (D-067)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, ops, passenger] = await Promise.all([
      prisma.company.create({ data: { name: `Ops dashboard ${randomUUID()}` } }),
      makeUser('Dashboard Ops Manager'),
      makeUser('Dashboard Passenger'),
    ]);
    companyId = company.id;
    opsId = ops.id;
    passengerId = passenger.id;
    await assignRole(opsId, 'OPS_MANAGER');
    await assignRole(passengerId, 'PASSENGER');

    const client = await prisma.client.create({ data: { companyId, name: `Dashboard Client ${randomUUID().slice(0, 6)}` } });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2028-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Operations dashboard test contract',
    }, opsId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, opsId, companyId, draft.id);
    const contractId = (await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, opsId, companyId, draft.id)).id;

    const employee = await prisma.employee.create({
      data: { companyId, clientId: client.id, fullName: 'Dashboard Employee', transportEligible: true },
    });
    const pending = await createBooking({
      employeeId: employee.id, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2028-05-04',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Pending queue fixture booking',
    }, opsId, companyId);
    expect(pending.status).toBe('Pending');
    const accepted = await createBooking({
      employeeId: employee.id, contractId, routeId: null, bookingType: 'OFFICE_TO_HOME', journeyDate: '2028-05-04',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Accepted queue fixture booking',
    }, opsId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Accepting the queue fixture' }, opsId, companyId, accepted.id);

    const today = accraToday();
    const resourced = await createTrip({
      clientId: client.id, routeId: null, serviceType: 'Staff busing', tripDate: today,
      plannedStartTime: '06:30', plannedDurationMinutes: 60, capacityLimit: 40,
      reason: 'Resourced dashboard trip fixture',
    }, opsId, companyId);
    const unresourced = await createTrip({
      clientId: client.id, routeId: null, serviceType: 'Staff busing', tripDate: today,
      plannedStartTime: '17:30', plannedDurationMinutes: 60, capacityLimit: 40,
      reason: 'Unresourced dashboard trip fixture',
    }, opsId, companyId);
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `OPS-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
      },
    });
    const driver = await prisma.driver.create({
      data: {
        companyId, fullName: 'Dashboard Driver', status: 'ACTIVE',
        licenceExpiresAt: new Date(`${today}T00:00:00.000Z`),
      },
    });
    // Licence expires today -> inside the 30-day warning window, not expired.
    await prisma.driver.update({
      where: { id: driver.id },
      data: { licenceExpiresAt: new Date(Date.now() + 10 * 86_400_000) },
    });
    await prisma.trip.update({
      where: { id: resourced.id }, data: { vehicleId: vehicle.id, driverId: driver.id },
    });
    expect(unresourced.vehicleId).toBeNull();
    await prisma.vehicleSafetyBlock.create({
      data: {
        companyId, vehicleId: vehicle.id, status: 'Out of Service',
        reason: 'Dashboard safety block fixture', appliedById: opsId,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('denies users without operations permissions', async () => {
    await expect(getOperationsDashboard({ actorId: passengerId, companyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('summarises today, queues and alerts from governed records', async () => {
    const dashboard = await getOperationsDashboard({ actorId: opsId, companyId });
    expect(dashboard.today).toBe(accraToday());
    expect(dashboard.tripsToday.total).toBe(2);
    expect(dashboard.tripsToday.byStatus).toEqual([{ status: 'Planned', count: 2 }]);
    expect(dashboard.tripsToday.unresourced).toBeGreaterThanOrEqual(1);
    const unresourced = dashboard.tripsToday.list.find((trip) => trip.plannedStartTime === '17:30');
    expect(unresourced?.needsVehicle).toBe(true);
    expect(unresourced?.needsDriver).toBe(true);
    const resourced = dashboard.tripsToday.list.find((trip) => trip.plannedStartTime === '06:30');
    expect(resourced?.driverName).toBe('Dashboard Driver');
    expect(resourced?.needsVehicle).toBe(false);

    expect(dashboard.bookingQueues.pendingTotal).toBe(1);
    expect(dashboard.bookingQueues.pendingOldest[0]?.employeeName).toBe('Dashboard Employee');
    expect(dashboard.bookingQueues.acceptedUnassignedTotal).toBe(1);
    expect(dashboard.bookingQueues.acceptedUnassignedNext[0]?.journeyDate).toBe('2028-05-04');

    expect(dashboard.fleetAlerts.activeSafetyBlocks).toBe(1);
    expect(dashboard.fleetAlerts.documents.driverLicencesExpiring).toBe(1);
    expect(dashboard.fleetAlerts.documents.driverLicencesExpired).toBe(0);
    expect(dashboard.fleetAlerts.documents.vehicleInsuranceExpired).toBe(0);
  });
});
