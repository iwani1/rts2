import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import { getPassengerHome } from '../passenger/passenger';
import {
  DriverValidationError,
  getDriverTrip,
  linkDriverAccount,
  postDriverEvent,
} from './driver';

const prisma = getPrisma();
const DAY = '2027-08-04';
let companyId = '';
let opsId = '';
let driverUserId = '';
let tripId = '';
let bookingOneId = '';
let bookingTwoId = '';
let bookingThreeId = '';
let passengerOneUserId = '';
let codeOne = '';

const key = () => `drv03-${randomUUID()}`;

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `drv03-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

async function makePassengerBooking(fullName: string, userId: string | null, contractId: string, clientId: string) {
  const employee = await prisma.employee.create({
    data: {
      companyId, clientId, fullName, transportEligible: true,
      ...(userId ? { userId } : {}),
    },
  });
  const booking = await createBooking({
    employeeId: employee.id, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: DAY,
    pickupLocationId: null, dropoffLocationId: null, notes: null, reason: `Boarding fixture booking for ${fullName}`,
  }, opsId, companyId);
  await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, opsId, companyId, booking.id);
  await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning passenger to boarding trip' }, opsId, companyId, tripId);
  return booking.id;
}

describe('boarding verification (DRV-03 / D-073)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const company = await prisma.company.create({ data: { name: `Boarding ${randomUUID()}` } });
    companyId = company.id;
    const [ops, driverUser, passengerOneUser] = await Promise.all([
      makeUser('Boarding Ops'), makeUser('Boarding Driver'), makeUser('Boarding Passenger One'),
    ]);
    opsId = ops.id;
    driverUserId = driverUser.id;
    passengerOneUserId = passengerOneUser.id;
    await prisma.userRoleAssignment.create({
      data: { userId: opsId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: driverUserId, companyId, roleCode: 'DRIVER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: passengerOneUserId, companyId, roleCode: 'PASSENGER', reason: 'Integration setup', assignedById: null },
    });
    // The company requires boarding codes.
    await prisma.setting.create({
      data: {
        companyId, key: 'trips.boarding_code_policy',
        value: { mode: 'REQUIRED' }, configured: true,
      },
    });

    const client = await prisma.client.create({ data: { companyId, name: `Boarding Client ${randomUUID()}` } });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Boarding test contract fixture',
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
        companyId, registrationNumber: `BRD-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
      },
    });
    const driver = await prisma.driver.create({ data: { companyId, fullName: 'Boarding Driver', status: 'ACTIVE' } });
    await linkDriverAccount({
      actorId: opsId, companyId, driverId: driver.id, userId: driverUserId,
      reason: 'Linking the driver login for boarding tests',
    });
    const trip = await createTrip({
      clientId: client.id, routeId: route.id, serviceType: null, tripDate: DAY, plannedStartTime: null,
      plannedDurationMinutes: null, capacityLimit: 40, reason: 'Boarding fixture trip',
    }, opsId, companyId);
    tripId = trip.id;
    await prisma.trip.update({ where: { id: tripId }, data: { vehicleId: vehicle.id, driverId: driver.id } });

    bookingOneId = await makePassengerBooking('Coded Passenger', passengerOneUserId, active.id, client.id);
    bookingTwoId = await makePassengerBooking('Manual Passenger', null, active.id, client.id);
    bookingThreeId = await makePassengerBooking('Late Policy Passenger', null, active.id, client.id);

    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing trip for dispatch' }, opsId, companyId, tripId);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Resources assigned; driver notified' }, opsId, companyId, tripId);

    const row = await prisma.bookingBoardingCode.findUniqueOrThrow({
      where: { companyId_bookingId: { companyId, bookingId: bookingOneId } },
    });
    codeOne = row.code;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('issues a 6-digit code at assignment, shown only to the passenger', async () => {
    expect(codeOne).toMatch(/^[0-9]{6}$/);
    const home = await getPassengerHome({ actorId: passengerOneUserId, companyId });
    const journey = [...home.upcoming, ...home.history].find((row) => row.bookingId === bookingOneId);
    expect(journey?.boardingCode).toBe(codeOne);

    const detail = await getDriverTrip({ actorId: driverUserId, companyId, tripId });
    expect(detail.boardingCodeRequired).toBe(true);
    expect(JSON.stringify(detail.manifest)).not.toContain(codeOne);
  });

  it('records failed code attempts and keeps the passenger unboarded', async () => {
    const wrong = codeOne === '000000' ? '111111' : '000000';
    await expect(postDriverEvent({
      eventType: 'BOARD', idempotencyKey: key(), bookingId: bookingOneId, boardingCode: wrong,
    }, driverUserId, companyId, tripId)).rejects.toBeInstanceOf(DriverValidationError);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingOneId } });
    expect(booking.status).toBe('Assigned');
    const attempts = await prisma.boardingVerificationAttempt.findMany({
      where: { companyId, bookingId: bookingOneId },
    });
    expect(attempts.map((row) => `${row.method}:${row.result}`)).toContain('CODE:FAILED');
  });

  it('boards with the correct code exactly once and consumes it', async () => {
    const result = await postDriverEvent({
      eventType: 'BOARD', idempotencyKey: key(), bookingId: bookingOneId, boardingCode: codeOne,
    }, driverUserId, companyId, tripId);
    expect(result.duplicate).toBe(false);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingOneId } });
    expect(booking.status).toBe('Boarded');
    const codeRow = await prisma.bookingBoardingCode.findUniqueOrThrow({
      where: { companyId_bookingId: { companyId, bookingId: bookingOneId } },
    });
    expect(codeRow.usedAt).toBeTruthy();
    const attempts = await prisma.boardingVerificationAttempt.findMany({
      where: { companyId, bookingId: bookingOneId, result: 'SUCCESS' },
    });
    expect(attempts).toHaveLength(1);
  });

  it('requires a recorded reason for manual boarding while codes are required', async () => {
    await expect(postDriverEvent({
      eventType: 'BOARD', idempotencyKey: key(), bookingId: bookingTwoId,
    }, driverUserId, companyId, tripId)).rejects.toBeInstanceOf(DriverValidationError);
    const manualAttempts = await prisma.boardingVerificationAttempt.findMany({
      where: { companyId, bookingId: bookingTwoId },
    });
    expect(manualAttempts.map((row) => `${row.method}:${row.result}`)).toContain('MANUAL:FAILED');

    await postDriverEvent({
      eventType: 'BOARD', idempotencyKey: key(), bookingId: bookingTwoId,
      manualReason: 'Passenger known to me; phone battery is dead',
    }, driverUserId, companyId, tripId);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingTwoId } });
    expect(booking.status).toBe('Boarded');
  });

  it('rejects expired codes, and tap-to-board returns when the policy is disabled', async () => {
    await prisma.bookingBoardingCode.updateMany({
      where: { companyId, bookingId: bookingThreeId },
      data: { expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    });
    const row = await prisma.bookingBoardingCode.findUniqueOrThrow({
      where: { companyId_bookingId: { companyId, bookingId: bookingThreeId } },
    });
    await expect(postDriverEvent({
      eventType: 'BOARD', idempotencyKey: key(), bookingId: bookingThreeId, boardingCode: row.code,
    }, driverUserId, companyId, tripId)).rejects.toBeInstanceOf(DriverValidationError);

    await prisma.setting.update({
      where: { companyId_key: { companyId, key: 'trips.boarding_code_policy' } },
      data: { value: { mode: 'DISABLED' } },
    });
    await postDriverEvent({
      eventType: 'BOARD', idempotencyKey: key(), bookingId: bookingThreeId,
    }, driverUserId, companyId, tripId);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingThreeId } });
    expect(booking.status).toBe('Boarded');
  });
});
