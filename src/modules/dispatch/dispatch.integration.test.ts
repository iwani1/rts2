import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip } from '../trips/trips';
import {
  DispatchAssignmentNotAllowedError,
  assignTripResources,
  getDispatchBoard,
  recordTripNoShow,
} from './dispatch';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let managerId = '';
let clientId = '';
let routeId = '';
let vehicleId = '';
let bigVehicleId = '';
let blockedVehicleId = '';
let driverId = '';
let expiredDriverId = '';
let tripId = '';
let secondTripId = '';
let booking1Id = '';
let booking2Id = '';
const DAY = '2027-07-05'; // Monday

describe('dispatch board and resource assignment with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Dispatch ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other dispatch ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Dispatcher Lead', email: `dispatch-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'DISPATCHER', reason: 'Integration setup', assignedById: null },
    });
    const client = await prisma.client.create({ data: { companyId, name: `Dispatch Client ${randomUUID()}` } });
    clientId = client.id;
    const draft = await createContract({
      clientId, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Integration test contract fixture',
    }, managerId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, managerId, companyId, draft.id);
    const active = await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, managerId, companyId, draft.id);
    const [origin, destination] = await Promise.all([
      prisma.location.create({ data: { companyId, name: 'Depot' } }),
      prisma.location.create({ data: { companyId, name: 'Client HQ' } }),
    ]);
    const route = await prisma.route.create({
      data: {
        companyId, clientId, name: 'Morning inbound', reference: `RTE-${randomUUID().slice(0, 12).toUpperCase()}`, operatingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        originLocationId: origin.id, destinationLocationId: destination.id, capacityRequirement: 10, active: true,
      },
    });
    routeId = route.id;
    const makeVehicle = async (seatCount: number) => prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `DSP-${randomUUID().slice(0, 8)}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount,
      },
    });
    vehicleId = (await makeVehicle(30)).id;
    bigVehicleId = (await makeVehicle(45)).id;
    blockedVehicleId = (await makeVehicle(30)).id;
    await prisma.vehicleSafetyBlock.create({
      data: { companyId, vehicleId: blockedVehicleId, status: 'Out of Service', reason: 'Brake defect reported', appliedById: managerId },
    });
    driverId = (await prisma.driver.create({ data: { companyId, fullName: 'Regular Driver', status: 'ACTIVE' } })).id;
    expiredDriverId = (await prisma.driver.create({
      data: { companyId, fullName: 'Expired Licence Driver', status: 'ACTIVE', licenceExpiresAt: new Date('2027-01-01T00:00:00.000Z') },
    })).id;
    const trip = await createTrip({
      clientId, routeId, serviceType: null, tripDate: DAY, plannedStartTime: null, plannedDurationMinutes: null,
      capacityLimit: 10, reason: 'Dispatch fixture trip one',
    }, managerId, companyId);
    tripId = trip.id;
    secondTripId = (await createTrip({
      clientId, routeId, serviceType: null, tripDate: DAY, plannedStartTime: null, plannedDurationMinutes: null,
      capacityLimit: 10, reason: 'Dispatch fixture trip two',
    }, managerId, companyId)).id;
    const [employee1, employee2] = await Promise.all([
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Rider One', transportEligible: true } }),
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Rider Two', transportEligible: true } }),
    ]);
    const accepted = async (employeeId: string) => {
      const booking = await createBooking({
        employeeId, contractId: active.id, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: DAY,
        pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Dispatch fixture booking',
      }, managerId, companyId);
      await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, managerId, companyId, booking.id);
      return booking.id;
    };
    booking1Id = await accepted(employee1.id);
    booking2Id = await accepted(employee2.id);
    await assignBookingToTrip({ bookingId: booking1Id, reason: 'Assigning rider one to trip' }, managerId, companyId, tripId);
    await assignBookingToTrip({ bookingId: booking2Id, reason: 'Assigning rider two to trip' }, managerId, companyId, tripId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('shows the day board with trips, capacity and unassigned bookings', async () => {
    const board = await getDispatchBoard({ actorId: managerId, companyId, date: DAY });
    expect(board.trips).toHaveLength(2);
    const first = board.trips.find((trip) => trip.id === tripId);
    expect(first?.passengerCount).toBe(2);
    expect(first?.capacityBasis).toBe(10);
    expect(board.unassignedAcceptedBookings).toHaveLength(0);
  });

  it('hard-blocks a safety-blocked vehicle and an expired licence', async () => {
    await expect(assignTripResources(
      { vehicleId: blockedVehicleId, override: true, reason: 'Trying to override safety block' }, managerId, companyId, tripId,
    )).rejects.toBeInstanceOf(DispatchAssignmentNotAllowedError);
    await expect(assignTripResources(
      { driverId: expiredDriverId, override: true, reason: 'Trying to override expired licence' }, managerId, companyId, tripId,
    )).rejects.toBeInstanceOf(DispatchAssignmentNotAllowedError);
  });

  it('requires an explicit override for a same-day driver conflict', async () => {
    await assignTripResources(
      { driverId, reason: 'Assigning driver to morning trip' }, managerId, companyId, tripId,
    );
    await expect(assignTripResources(
      { driverId, reason: 'Double-booking the same driver' }, managerId, companyId, secondTripId,
    )).rejects.toBeInstanceOf(DispatchAssignmentNotAllowedError);
    const result = await assignTripResources(
      { driverId, override: true, reason: 'Back-to-back trips; dispatcher confirmed the driver can cover both' },
      managerId, companyId, secondTripId,
    );
    expect(result.trip.driverId).toBe(driverId);
    expect(result.warnings.map((warning) => warning.type)).toContain('DRIVER_DAY_CONFLICT');
  });

  it('requires an override when vehicle seats are below the requirement, and assigns when clean', async () => {
    const small = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `DSP-${randomUUID().slice(0, 8)}`,
        make: 'Testbus', model: 'Mini', category: 'MINIBUS', seatCount: 5,
      },
    });
    await expect(assignTripResources(
      { vehicleId: small.id, reason: 'Trying the small bus without override' }, managerId, companyId, tripId,
    )).rejects.toBeInstanceOf(DispatchAssignmentNotAllowedError);
    const overridden = await assignTripResources(
      { vehicleId: small.id, override: true, reason: 'Only two passengers today; small bus is sufficient' },
      managerId, companyId, tripId,
    );
    expect(overridden.warnings.map((warning) => warning.type)).toContain('VEHICLE_SEATS_BELOW_REQUIREMENT');
    const clean = await assignTripResources(
      { vehicleId: bigVehicleId, reason: 'Using the large bus for comfort' }, managerId, companyId, tripId,
    );
    expect(clean.trip.vehicleId).toBe(bigVehicleId);
    expect(clean.trip.vehicleRegistration).toBeTruthy();
    expect(clean.warnings).toEqual([]);
  });

  it('records a no-show and frees the manifest seat', async () => {
    const before = await getDispatchBoard({ actorId: managerId, companyId, date: DAY });
    expect(before.trips.find((trip) => trip.id === tripId)?.passengerCount).toBe(2);
    const result = await recordTripNoShow(
      { bookingId: booking2Id, reason: 'Passenger did not arrive at the pickup point' }, managerId, companyId, tripId,
    );
    expect(result.entries.map((entry) => entry.bookingId)).not.toContain(booking2Id);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: booking2Id } });
    expect(booking.status).toBe('Cancelled');
    const after = await getDispatchBoard({ actorId: managerId, companyId, date: DAY });
    expect(after.trips.find((trip) => trip.id === tripId)?.passengerCount).toBe(1);
  });

  it('denies dispatch access across companies', async () => {
    await expect(getDispatchBoard({ actorId: managerId, companyId: otherCompanyId, date: DAY })).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
