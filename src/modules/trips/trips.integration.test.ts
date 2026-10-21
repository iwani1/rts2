import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import {
  TripCapacityError,
  TripPolicyError,
  TripTransitionNotAllowedError,
  assignBookingToTrip,
  createTrip,
  generateTripsFromSchedules,
  getTripManifest,
  listTrips,
  transitionTrip,
  unassignBookingFromTrip,
} from './trips';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let managerId = '';
let clientId = '';
let routeId = '';
let employee1Id = '';
let employee2Id = '';
let contractId = '';
let tripId = '';
let booking1Id = '';
let booking2Id = '';
const JOURNEY = '2027-06-07'; // Monday

describe('trips, manifests and capacity with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Trips ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other trips ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Trip Ops Manager', email: `trip-mgr-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    const client = await prisma.client.create({ data: { companyId, name: `Trip Client ${randomUUID()}` } });
    clientId = client.id;
    const [employee1, employee2] = await Promise.all([
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Passenger One', transportEligible: true } }),
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Passenger Two', transportEligible: true } }),
    ]);
    employee1Id = employee1.id;
    employee2Id = employee2.id;
    const draft = await createContract({
      clientId, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Integration test contract fixture',
    }, managerId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, managerId, companyId, draft.id);
    const active = await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, managerId, companyId, draft.id);
    contractId = active.id;
    const [origin, destination] = await Promise.all([
      prisma.location.create({ data: { companyId, name: 'Depot', type: 'DEPOT', clientId } }),
      prisma.location.create({ data: { companyId, name: 'Client HQ', type: 'CLIENT_PREMISES', clientId } }),
    ]);
    const route = await prisma.route.create({
      data: {
        companyId, clientId, name: 'Morning inbound', transportMode: 'BUS',
        originLocationId: origin.id, destinationLocationId: destination.id,
        capacityRequirement: 40, active: true,
      },
    });
    routeId = route.id;
    await prisma.routeSchedule.create({
      data: {
        companyId, routeId, name: 'Weekday mornings', kind: 'RECURRING',
        daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'], scheduleDate: null,
        plannedStartTime: '06:30', active: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const acceptedBooking = async (employeeId: string) => {
    const booking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: JOURNEY,
      pickupLocationId: null, dropoffLocationId: null, notes: null,
      reason: 'Integration test booking entry',
    }, managerId, companyId);
    await transitionBooking(
      { toStatus: 'Accepted', reason: 'Seat confirmed for fixture booking' }, managerId, companyId, booking.id,
    );
    return booking.id;
  };

  it('materializes trips from schedules and is idempotent across reruns', async () => {
    const first = await generateTripsFromSchedules(
      { fromDate: JOURNEY, toDate: '2027-06-13', reason: 'Generating trips for fixture week' }, managerId, companyId,
    );
    expect(first.created).toBe(5);
    expect(first.skipped).toBe(0);
    const second = await generateTripsFromSchedules(
      { fromDate: JOURNEY, toDate: '2027-06-13', reason: 'Regenerating to confirm idempotency' }, managerId, companyId,
    );
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(5);
  });

  it('assigns bookings with a transactional capacity check that parallel requests cannot exceed', async () => {
    const trip = await createTrip({
      clientId, routeId, serviceType: null, tripDate: JOURNEY, plannedStartTime: null,
      plannedDurationMinutes: null, capacityLimit: 1, reason: 'Manual trip for capacity fixture',
    }, managerId, companyId);
    tripId = trip.id;
    expect(trip.capacityLimit).toBe(1);
    booking1Id = await acceptedBooking(employee1Id);
    booking2Id = await acceptedBooking(employee2Id);
    const assigned = await assignBookingToTrip(
      { bookingId: booking1Id, reason: 'Assigning first passenger to trip' }, managerId, companyId, tripId,
    );
    expect(assigned.passengerCount).toBe(1);
    await expect(assignBookingToTrip(
      { bookingId: booking2Id, reason: 'Assigning second passenger over capacity' }, managerId, companyId, tripId,
    )).rejects.toBeInstanceOf(TripCapacityError);
    await unassignBookingFromTrip(
      { bookingId: booking1Id, reason: 'Freeing the seat for parallel test' }, managerId, companyId, tripId,
    );
    const outcomes = await Promise.allSettled([
      assignBookingToTrip({ bookingId: booking1Id, reason: 'Parallel assignment A for capacity' }, managerId, companyId, tripId),
      assignBookingToTrip({ bookingId: booking2Id, reason: 'Parallel assignment B for capacity' }, managerId, companyId, tripId),
    ]);
    const succeeded = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const failed = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(TripCapacityError);
    const manifest = await getTripManifest({ actorId: managerId, companyId, tripId });
    expect(manifest.passengerCount).toBe(1);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].employeeName).toMatch(/^Passenger (One|Two)$/);
    expect(Object.keys(manifest.entries[0]).sort()).toEqual([
      'bookingId', 'bookingReference', 'bookingType', 'dropoffName', 'employeeName', 'pickupName', 'status',
    ]);
  });

  it('refuses dispatch without resources and walks the approved lifecycle', async () => {
    await expect(transitionTrip(
      { toStatus: 'Completed', reason: 'Skipping the whole lifecycle' }, managerId, companyId, tripId,
    )).rejects.toBeInstanceOf(TripTransitionNotAllowedError);
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Trip prepared for dispatch' }, managerId, companyId, tripId);
    await expect(transitionTrip(
      { toStatus: 'Dispatched', reason: 'Dispatching without resources' }, managerId, companyId, tripId,
    )).rejects.toBeInstanceOf(TripPolicyError);
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `TRP-${randomUUID().slice(0, 8)}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 30,
      },
    });
    const driver = await prisma.driver.create({
      data: { companyId, fullName: 'Fixture Driver', status: 'ACTIVE' },
    });
    await prisma.trip.update({ where: { id: tripId }, data: { vehicleId: vehicle.id, driverId: driver.id } });
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Vehicle and driver assigned manually' }, managerId, companyId, tripId);
    await transitionTrip({ toStatus: 'In Progress', reason: 'Driver departed depot on time' }, managerId, companyId, tripId);
    await transitionTrip({ toStatus: 'Delayed', reason: 'Heavy traffic on the main corridor', delayReason: 'Heavy traffic' }, managerId, companyId, tripId);
    const completed = await transitionTrip(
      { toStatus: 'Completed', reason: 'All passengers dropped off at HQ', completionNotes: 'Completed with a short delay.' },
      managerId, companyId, tripId,
    );
    expect(completed.status).toBe('Completed');
    expect(completed.actualStartAt).not.toBeNull();
    expect(completed.actualEndAt).not.toBeNull();
    const detail = await listTrips({ actorId: managerId, companyId, status: 'Completed' });
    expect(detail.trips.some((trip) => trip.id === tripId)).toBe(true);
  });

  it('denies trip access across companies', async () => {
    await expect(listTrips({ actorId: managerId, companyId: otherCompanyId })).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
