import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import { linkDriverAccount } from '../driver/driver';
import {
  IncidentValidationError,
  reportIncidentAsDriver,
  transitionIncident,
} from './incidents';
import {
  confirmIncidentReplacement,
  getIncidentResponsePlan,
} from './incident-response';

const prisma = getPrisma();
const DAY = '2027-08-03';
let companyId = '';
let opsId = '';
let driverUserId = '';
let passengerUserId = '';
let tripId = '';
let incidentId = '';
let freeVehicleId = '';
let blockedVehicleId = '';
let busyVehicleId = '';
let freeDriverId = '';
let busyDriverId = '';

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `inc2-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

async function makeVehicle(registrationNumber: string, seatCount = 40) {
  return prisma.vehicle.create({
    data: {
      companyId, registrationNumber,
      make: 'Testbus', model: 'Coach', category: 'BUS', seatCount,
    },
  });
}

describe('breakdown response (INC-02 / D-072)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const company = await prisma.company.create({ data: { name: `Incident Response ${randomUUID()}` } });
    companyId = company.id;
    const [ops, driverUser, passengerUser] = await Promise.all([
      makeUser('Response Ops'), makeUser('Response Driver'), makeUser('Response Passenger'),
    ]);
    opsId = ops.id;
    driverUserId = driverUser.id;
    passengerUserId = passengerUser.id;
    await prisma.userRoleAssignment.create({
      data: { userId: opsId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: driverUserId, companyId, roleCode: 'DRIVER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: passengerUserId, companyId, roleCode: 'PASSENGER', reason: 'Integration setup', assignedById: null },
    });

    const client = await prisma.client.create({ data: { companyId, name: `Response Client ${randomUUID()}` } });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Incident response contract fixture',
    }, opsId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, opsId, companyId, draft.id);
    const active = await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, opsId, companyId, draft.id);
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

    const suffix = randomUUID().slice(0, 6).toUpperCase();
    const originalVehicle = await makeVehicle(`ORG-${suffix}`);
    const freeVehicle = await makeVehicle(`REP-${suffix}`);
    freeVehicleId = freeVehicle.id;
    const blockedVehicle = await makeVehicle(`BLK-${suffix}`);
    blockedVehicleId = blockedVehicle.id;
    const busyVehicle = await makeVehicle(`BSY-${suffix}`);
    busyVehicleId = busyVehicle.id;
    await prisma.vehicleSafetyBlock.create({
      data: {
        companyId, vehicleId: blockedVehicle.id, status: 'Out of Service',
        reason: 'Engine fault under investigation', appliedById: opsId,
      },
    });

    const driver = await prisma.driver.create({ data: { companyId, fullName: 'Response Driver', status: 'ACTIVE' } });
    const freeDriver = await prisma.driver.create({ data: { companyId, fullName: 'Free Driver', status: 'ACTIVE' } });
    freeDriverId = freeDriver.id;
    const busyDriver = await prisma.driver.create({ data: { companyId, fullName: 'Busy Driver', status: 'ACTIVE' } });
    busyDriverId = busyDriver.id;
    await prisma.driver.create({
      data: {
        companyId, fullName: 'Expired Licence Driver', status: 'ACTIVE',
        licenceExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
    await linkDriverAccount({
      actorId: opsId, companyId, driverId: driver.id, userId: driverUserId,
      reason: 'Linking the driver login for response tests',
    });

    const trip = await createTrip({
      clientId: client.id, routeId: route.id, serviceType: null, tripDate: DAY, plannedStartTime: null,
      plannedDurationMinutes: null, capacityLimit: 40, reason: 'Incident response fixture trip',
    }, opsId, companyId);
    tripId = trip.id;
    await prisma.trip.update({ where: { id: tripId }, data: { vehicleId: originalVehicle.id, driverId: driver.id } });

    const secondTrip = await createTrip({
      clientId: client.id, routeId: route.id, serviceType: null, tripDate: DAY, plannedStartTime: null,
      plannedDurationMinutes: null, capacityLimit: 40, reason: 'Second trip holding busy resources',
    }, opsId, companyId);
    await prisma.trip.update({
      where: { id: secondTrip.id }, data: { vehicleId: busyVehicle.id, driverId: busyDriver.id },
    });
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Second trip ready with busy resources' }, opsId, companyId, secondTrip.id);

    const employee = await prisma.employee.create({
      data: { companyId, clientId: client.id, fullName: 'Affected Passenger', transportEligible: true, userId: passengerUserId },
    });
    const booking = await createBooking({
      employeeId: employee.id, contractId: active.id, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: DAY,
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Incident response fixture booking',
    }, opsId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, opsId, companyId, booking.id);
    await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning passenger to response trip' }, opsId, companyId, tripId);
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing trip for dispatch' }, opsId, companyId, tripId);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Resources assigned; driver notified' }, opsId, companyId, tripId);

    const incident = await reportIncidentAsDriver({
      tripId,
      incidentType: 'BREAKDOWN',
      severity: 'CRITICAL',
      occurredAt: new Date().toISOString(),
      locationText: 'Tema motorway roundabout',
      description: 'Engine cut out completely; vehicle will not restart',
      immediateAction: 'Parked on the shoulder, passengers safe',
      reason: 'Driver reporting a full breakdown',
    }, driverUserId, companyId);
    incidentId = incident.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('suggests only eligible replacements (no blocked, busy, current or expired-licence options)', async () => {
    const plan = await getIncidentResponsePlan({ actorId: opsId, companyId, incidentId });
    expect(plan.canConfirm).toBe(true);
    expect(plan.affectedTrips).toHaveLength(1);
    expect(plan.affectedTrips[0].passengerCount).toBe(1);
    const vehicleIds = plan.replacementVehicles.map((vehicle) => vehicle.vehicleId);
    expect(vehicleIds).toContain(freeVehicleId);
    expect(vehicleIds).not.toContain(blockedVehicleId);
    expect(vehicleIds).not.toContain(busyVehicleId);
    const driverIds = plan.replacementDrivers.map((driver) => driver.driverId);
    expect(driverIds).toContain(freeDriverId);
    expect(driverIds).not.toContain(busyDriverId);
    expect(plan.replacementDrivers.map((driver) => driver.fullName)).not.toContain('Expired Licence Driver');
  });

  it('refuses a safety-blocked vehicle outright and a busy vehicle without override', async () => {
    await expect(confirmIncidentReplacement({
      tripId, newVehicleId: blockedVehicleId, newDriverId: null,
      override: true, reason: 'Trying to use a blocked vehicle',
      blockOriginalVehicle: false, createWorkOrder: false,
    }, opsId, companyId, incidentId)).rejects.toBeInstanceOf(IncidentValidationError);
    await expect(confirmIncidentReplacement({
      tripId, newVehicleId: busyVehicleId, newDriverId: null,
      override: false, reason: 'Trying to double-book the busy vehicle',
      blockOriginalVehicle: false, createWorkOrder: false,
    }, opsId, companyId, incidentId)).rejects.toBeInstanceOf(IncidentValidationError);
  });

  it('confirms with override, then a clean replacement with block + work order, notifying passengers', async () => {
    const overridden = await confirmIncidentReplacement({
      tripId, newVehicleId: busyVehicleId, newDriverId: null,
      override: true, reason: 'Busy vehicle finishes its run first, then takes over',
      blockOriginalVehicle: false, createWorkOrder: false,
    }, opsId, companyId, incidentId);
    expect(overridden.vehicleId).toBe(busyVehicleId);
    expect(overridden.notifiedPassengers).toBe(1);

    const result = await confirmIncidentReplacement({
      tripId, newVehicleId: freeVehicleId, newDriverId: freeDriverId,
      override: false, reason: 'Replacement coach and driver sent from the depot',
      blockOriginalVehicle: true, createWorkOrder: true,
    }, opsId, companyId, incidentId);
    expect(result.warnings).toEqual([]);
    expect(result.safetyBlockApplied).toBe(true);
    expect(result.workOrderReference).toMatch(/^WO-/);
    expect(result.notifiedPassengers).toBe(1);

    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(trip.vehicleId).toBe(freeVehicleId);
    expect(trip.driverId).toBe(freeDriverId);
    const block = await prisma.vehicleSafetyBlock.findFirst({
      where: { companyId, vehicleId: busyVehicleId, releasedAt: null },
    });
    expect(block?.status).toBe('Out of Service');
    const audit = await prisma.auditEvent.findMany({
      where: { companyId, entityId: incidentId, action: 'INCIDENT_REPLACEMENT_CONFIRMED' },
    });
    expect(audit).toHaveLength(2);
    const passengerAlerts = await prisma.notification.findMany({
      where: { companyId, userId: passengerUserId, type: 'INCIDENT_REPLACEMENT_CONFIRMED' },
    });
    expect(passengerAlerts.length).toBeGreaterThanOrEqual(1);
    const incident = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId } });
    expect(incident.status).toBe('Open');
  });

  it('refuses replacements once the incident is resolved', async () => {
    await transitionIncident({ toStatus: 'Acknowledged', reason: 'Dispatcher coordinating the recovery' }, opsId, companyId, incidentId);
    await transitionIncident({
      toStatus: 'Resolved', reason: 'All passengers completed their journeys',
      resolutionNotes: 'Replacement coach completed the route; original vehicle in the workshop.',
    }, opsId, companyId, incidentId);
    await expect(confirmIncidentReplacement({
      tripId, newVehicleId: freeVehicleId, newDriverId: null,
      override: false, reason: 'Trying to replace after resolution',
      blockOriginalVehicle: false, createWorkOrder: false,
    }, opsId, companyId, incidentId)).rejects.toBeInstanceOf(IncidentValidationError);
  });
});
