import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import {
  DriverEventConflictError,
  DriverNotLinkedError,
  DriverTripNotFoundError,
  getDriverTrip,
  linkDriverAccount,
  listDriverTrips,
  postDriverEvent,
} from './driver';

const prisma = getPrisma();
let companyId = '';
let managerId = '';
let driverUserId = '';
let secondDriverUserId = '';
let unlinkedUserId = '';
let tripId = '';
let bookingId = '';
const DAY = '2027-08-02'; // Monday

describe('driver interface with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const company = await prisma.company.create({ data: { name: `Driver UI ${randomUUID()}` } });
    companyId = company.id;
    const makeUser = async (name: string) => prisma.user.create({
      data: { name, email: `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    const [manager, driverUser, secondDriverUser, unlinkedUser] = await Promise.all([
      makeUser('Driver Ops Manager'), makeUser('Assigned Driver'), makeUser('Second Driver'), makeUser('Unlinked Driver'),
    ]);
    managerId = manager.id;
    driverUserId = driverUser.id;
    secondDriverUserId = secondDriverUser.id;
    unlinkedUserId = unlinkedUser.id;
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    for (const userId of [driverUserId, secondDriverUserId, unlinkedUserId]) {
      await prisma.userRoleAssignment.create({
        data: { userId, companyId, roleCode: 'DRIVER', reason: 'Integration setup', assignedById: null },
      });
    }
    const client = await prisma.client.create({ data: { companyId, name: `Driver Client ${randomUUID()}` } });
    const driver = await prisma.driver.create({ data: { companyId, fullName: 'Assigned Driver', status: 'ACTIVE' } });
    await prisma.driver.create({ data: { companyId, fullName: 'Second Driver', status: 'ACTIVE' } });
    await linkDriverAccount({
      actorId: managerId, companyId, driverId: driver.id, userId: driverUserId,
      reason: 'Linking the driver login for integration tests',
    });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31', renewalDate: null,
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
        companyId, clientId: client.id, name: 'Morning inbound', reference: `RTE-${randomUUID().slice(0, 12).toUpperCase()}`, operatingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        originLocationId: origin.id, destinationLocationId: destination.id, capacityRequirement: 40, active: true,
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `DRV-${randomUUID().slice(0, 8)}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
      },
    });
    const trip = await createTrip({
      clientId: client.id, routeId: route.id, serviceType: null, tripDate: DAY, plannedStartTime: null,
      plannedDurationMinutes: null, capacityLimit: 40, reason: 'Driver interface fixture trip',
    }, managerId, companyId);
    tripId = trip.id;
    await prisma.trip.update({ where: { id: tripId }, data: { vehicleId: vehicle.id, driverId: driver.id } });
    const employee = await prisma.employee.create({
      data: { companyId, clientId: client.id, fullName: 'Riding Passenger', transportEligible: true },
    });
    const booking = await createBooking({
      employeeId: employee.id, contractId: active.id, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: DAY,
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Driver interface fixture booking',
    }, managerId, companyId);
    bookingId = booking.id;
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, managerId, companyId, bookingId);
    await assignBookingToTrip({ bookingId, reason: 'Assigning passenger to driver trip' }, managerId, companyId, tripId);
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing trip for dispatch' }, managerId, companyId, tripId);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Resources assigned; driver notified' }, managerId, companyId, tripId);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('shows a driver only their own trips and denies unlinked accounts', async () => {
    const mine = await listDriverTrips({ actorId: driverUserId, companyId, date: DAY });
    expect(mine.trips.map((trip) => trip.id)).toEqual([tripId]);
    expect(mine.trips[0].passengerCount).toBe(1);
    await expect(listDriverTrips({ actorId: secondDriverUserId, companyId, date: DAY }))
      .rejects.toBeInstanceOf(DriverNotLinkedError);
    await expect(listDriverTrips({ actorId: unlinkedUserId, companyId })).rejects.toBeInstanceOf(DriverNotLinkedError);
    await expect(getDriverTrip({ actorId: secondDriverUserId, companyId, tripId }))
      .rejects.toBeInstanceOf(DriverNotLinkedError);
  });

  it('applies driver events exactly once per idempotency key', async () => {
    const started = await postDriverEvent(
      { eventType: 'START', idempotencyKey: 'start-key-0001' }, driverUserId, companyId, tripId,
    );
    expect(started).toMatchObject({ duplicate: false, tripStatus: 'In Progress' });
    const replay = await postDriverEvent(
      { eventType: 'START', idempotencyKey: 'start-key-0001' }, driverUserId, companyId, tripId,
    );
    expect(replay.duplicate).toBe(true);
    expect(replay.eventId).toBe(started.eventId);
    const historyCount = await prisma.tripStatusHistory.count({ where: { companyId, tripId, toStatus: 'In Progress' } });
    expect(historyCount).toBe(1);
    await expect(postDriverEvent(
      { eventType: 'DELAY', idempotencyKey: 'start-key-0001', reason: 'Reusing a key for another event' },
      driverUserId, companyId, tripId,
    )).rejects.toBeInstanceOf(DriverEventConflictError);
  });

  it('boards a passenger, delays, completes and finishes the booking', async () => {
    const delayed = await postDriverEvent(
      { eventType: 'DELAY', idempotencyKey: 'delay-key-0001', reason: 'Slow traffic approaching the office park' },
      driverUserId, companyId, tripId,
    );
    expect(delayed.tripStatus).toBe('Delayed');
    const boarded = await postDriverEvent(
      { eventType: 'BOARD', idempotencyKey: 'board-key-0001', bookingId }, driverUserId, companyId, tripId,
    );
    expect(boarded.tripStatus).toBe('Delayed');
    const completed = await postDriverEvent(
      { eventType: 'COMPLETE', idempotencyKey: 'complete-key-01', notes: 'All passengers dropped at HQ.' },
      driverUserId, companyId, tripId,
    );
    expect(completed.tripStatus).toBe('Completed');
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe('Completed');
    const detail = await getDriverTrip({ actorId: driverUserId, companyId, tripId });
    expect(detail.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['START', 'DELAY', 'BOARD', 'COMPLETE']),
    );
  });

  it('hides another driver\u2019s trip completely', async () => {
    const other = await prisma.driver.findFirstOrThrow({ where: { companyId, fullName: 'Second Driver' } });
    await linkDriverAccount({
      actorId: managerId, companyId, driverId: other.id, userId: secondDriverUserId,
      reason: 'Linking the second driver for isolation tests',
    });
    const trips = await listDriverTrips({ actorId: secondDriverUserId, companyId, date: DAY });
    expect(trips.trips).toEqual([]);
    await expect(getDriverTrip({ actorId: secondDriverUserId, companyId, tripId }))
      .rejects.toBeInstanceOf(DriverTripNotFoundError);
    await expect(postDriverEvent(
      { eventType: 'START', idempotencyKey: 'intruder-key-01' }, secondDriverUserId, companyId, tripId,
    )).rejects.toBeInstanceOf(DriverTripNotFoundError);
  });
});
