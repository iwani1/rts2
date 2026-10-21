import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import { linkDriverAccount } from '../driver/driver';
import {
  IncidentDriverNotLinkedError,
  IncidentTransitionNotAllowedError,
  IncidentValidationError,
  getIncidentDetail,
  listIncidents,
  reportIncident,
  reportIncidentAsDriver,
  transitionIncident,
} from './incidents';

const prisma = getPrisma();
const DAY = '2026-05-11';
let companyId = '';
let opsId = '';
let secondOpsId = '';
let driverUserId = '';
let unlinkedUserId = '';
let tripId = '';
let driverIncidentId = '';

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `inc-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

describe('incident records and driver reporting (INC-01 / D-071)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const company = await prisma.company.create({ data: { name: `Incidents ${randomUUID()}` } });
    companyId = company.id;
    const [ops, secondOps, driverUser, unlinkedUser] = await Promise.all([
      makeUser('Incident Ops'), makeUser('Incident Second Ops'), makeUser('Incident Driver'), makeUser('Incident Unlinked'),
    ]);
    opsId = ops.id;
    secondOpsId = secondOps.id;
    driverUserId = driverUser.id;
    unlinkedUserId = unlinkedUser.id;
    for (const userId of [opsId, secondOpsId]) {
      await prisma.userRoleAssignment.create({
        data: { userId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
      });
    }
    for (const userId of [driverUserId, unlinkedUserId]) {
      await prisma.userRoleAssignment.create({
        data: { userId, companyId, roleCode: 'DRIVER', reason: 'Integration setup', assignedById: null },
      });
    }
    const client = await prisma.client.create({ data: { companyId, name: `Incident Client ${randomUUID()}` } });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Incident test contract fixture',
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
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `INC-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
      },
    });
    const driver = await prisma.driver.create({ data: { companyId, fullName: 'Incident Driver', status: 'ACTIVE' } });
    await linkDriverAccount({
      actorId: opsId, companyId, driverId: driver.id, userId: driverUserId,
      reason: 'Linking the driver login for incident tests',
    });
    const trip = await createTrip({
      clientId: client.id, routeId: route.id, serviceType: null, tripDate: DAY, plannedStartTime: null,
      plannedDurationMinutes: null, capacityLimit: 40, reason: 'Incident fixture trip',
    }, opsId, companyId);
    tripId = trip.id;
    await prisma.trip.update({ where: { id: tripId }, data: { vehicleId: vehicle.id, driverId: driver.id } });
    const employee = await prisma.employee.create({
      data: { companyId, clientId: client.id, fullName: 'Stranded Passenger', transportEligible: true },
    });
    const booking = await createBooking({
      employeeId: employee.id, contractId: active.id, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: DAY,
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Incident fixture booking',
    }, opsId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, opsId, companyId, booking.id);
    await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning passenger to incident trip' }, opsId, companyId, tripId);
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing trip for dispatch' }, opsId, companyId, tripId);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Resources assigned; driver notified' }, opsId, companyId, tripId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lets a driver report a breakdown on their own trip and alerts dispatch, not themselves', async () => {
    const incident = await reportIncidentAsDriver({
      tripId,
      incidentType: 'BREAKDOWN',
      severity: 'HIGH',
      occurredAt: new Date().toISOString(),
      locationText: 'Near Achimota overhead',
      description: 'Engine overheating; pulled over safely',
      immediateAction: 'Parked safely and informed passengers',
      reason: 'Driver breakdown report from the road',
    }, driverUserId, companyId);
    driverIncidentId = incident.id;
    expect(incident.status).toBe('Open');
    expect(incident.tripId).toBe(tripId);
    expect(incident.vehicleId).toBeTruthy();
    expect(incident.driverId).toBeTruthy();

    const alerts = await prisma.notification.findMany({
      where: { companyId, entityId: incident.id, type: 'INCIDENT_REPORTED' },
      select: { userId: true },
    });
    expect(alerts.map((row) => row.userId).sort()).toEqual([opsId, secondOpsId].sort());
  });

  it('refuses driver reports for other drivers trips and for unlinked logins', async () => {
    await expect(reportIncidentAsDriver({
      tripId: randomUUID(),
      incidentType: 'OTHER',
      severity: 'LOW',
      occurredAt: new Date().toISOString(),
      locationText: null,
      description: 'Trying to report against a foreign trip',
      immediateAction: null,
      reason: 'Negative driver report test fixture',
    }, driverUserId, companyId)).rejects.toBeInstanceOf(IncidentValidationError);
    await expect(reportIncidentAsDriver({
      tripId,
      incidentType: 'OTHER',
      severity: 'LOW',
      occurredAt: new Date().toISOString(),
      locationText: null,
      description: 'Unlinked login attempting a driver report',
      immediateAction: null,
      reason: 'Negative driver report test fixture',
    }, unlinkedUserId, companyId)).rejects.toBeInstanceOf(IncidentDriverNotLinkedError);
  });

  it('runs the governed lifecycle: resolve needs notes, close is terminal, reopen clears resolution', async () => {
    await transitionIncident({ toStatus: 'Acknowledged', reason: 'Dispatcher has seen the breakdown' }, opsId, companyId, driverIncidentId);
    await transitionIncident({ toStatus: 'In Progress', reason: 'Replacement coach being arranged now' }, opsId, companyId, driverIncidentId);
    await expect(transitionIncident(
      { toStatus: 'Resolved', reason: 'Claiming resolution without notes' }, opsId, companyId, driverIncidentId,
    )).rejects.toBeInstanceOf(IncidentValidationError);
    const resolved = await transitionIncident({
      toStatus: 'Resolved',
      reason: 'Passengers transferred to replacement coach',
      resolutionNotes: 'Replacement coach collected all passengers; original vehicle towed to depot.',
    }, opsId, companyId, driverIncidentId);
    expect(resolved.status).toBe('Resolved');
    expect(resolved.resolvedAt).toBeTruthy();

    const reopened = await transitionIncident(
      { toStatus: 'In Progress', reason: 'Vehicle fault turned out to be more serious' }, opsId, companyId, driverIncidentId,
    );
    expect(reopened.status).toBe('In Progress');
    expect(reopened.resolvedAt).toBeNull();
    await transitionIncident({
      toStatus: 'Resolved',
      reason: 'Repairs confirmed by the maintenance team',
      resolutionNotes: 'Radiator replaced and vehicle returned to service.',
    }, opsId, companyId, driverIncidentId);
    await transitionIncident({ toStatus: 'Closed', reason: 'Incident reviewed and closed out' }, opsId, companyId, driverIncidentId);
    await expect(transitionIncident(
      { toStatus: 'In Progress', reason: 'Trying to reopen a closed incident' }, opsId, companyId, driverIncidentId,
    )).rejects.toBeInstanceOf(IncidentTransitionNotAllowedError);
  });

  it('shows restricted detail, affected passengers and full history to managers only', async () => {
    const managerIncident = await reportIncident({
      incidentType: 'COMPLAINT',
      severity: 'LOW',
      tripId,
      vehicleId: null,
      driverId: null,
      occurredAt: new Date().toISOString(),
      locationText: null,
      description: 'Passenger complained about the air conditioning',
      peopleAffected: 'One named passenger (restricted detail)',
      immediateAction: 'Driver apologised and opened vents',
      reason: 'Manager logging a passenger complaint',
    }, opsId, companyId);
    const detail = await getIncidentDetail({ actorId: secondOpsId, companyId, incidentId: managerIncident.id });
    expect(detail.incident.peopleAffected).toContain('restricted detail');
    expect(detail.affectedPassengers.map((row) => row.employeeName)).toContain('Stranded Passenger');
    expect(detail.history.map((row) => row.toStatus)).toEqual(['Open']);

    const register = await listIncidents({ actorId: opsId, companyId, status: 'Closed' });
    expect(register.incidents.map((row) => row.id)).toContain(driverIncidentId);
    // The manager who reported is not alerted about their own report.
    const alerts = await prisma.notification.findMany({
      where: { companyId, entityId: managerIncident.id, type: 'INCIDENT_REPORTED' },
      select: { userId: true },
    });
    expect(alerts.map((row) => row.userId)).toEqual([secondOpsId]);
  });

  it('denies incident access without trip management access in the company', async () => {
    await expect(listIncidents({ actorId: driverUserId, companyId })).rejects.toBeInstanceOf(PermissionDeniedError);
    const otherCompany = await prisma.company.create({ data: { name: `Incidents Other ${randomUUID()}` } });
    await expect(listIncidents({ actorId: opsId, companyId: otherCompany.id })).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
