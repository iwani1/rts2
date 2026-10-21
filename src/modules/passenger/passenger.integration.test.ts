import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking, BookingDuplicateError, BookingValidationError } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import { linkDriverAccount, postDriverEvent } from '../driver/driver';
import {
  cancelPassengerJourney,
  getPassengerHome,
  linkPassengerAccount,
  PassengerBookingNotFoundError,
  PassengerNotLinkedError,
  PassengerPolicyError,
  PassengerValidationError,
  requestPassengerJourney,
  submitPassengerFeedback,
  unlinkPassengerAccount,
} from './passenger';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let opsId = '';
let passengerId = '';
let passengerTwoId = '';
let unlinkedPassengerId = '';
let driverUserId = '';
let employeeId = '';
let employeeTwoId = '';
let contractId = '';

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `pax-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

async function assignRole(userId: string, roleCode: string) {
  await prisma.userRoleAssignment.create({
    data: { userId, companyId, roleCode, reason: 'Integration setup', assignedById: null },
  });
}

function requestJourney(journeyDate: string, bookingType: 'HOME_TO_OFFICE' | 'OFFICE_TO_HOME' = 'HOME_TO_OFFICE') {
  return requestPassengerJourney(
    {
      contractId: null, routeId: null, bookingType, journeyDate,
      pickupLocationId: null, dropoffLocationId: null, notes: null,
    },
    passengerId, companyId,
  );
}

describe('passenger portal with linked employee identity (PAX-01 / D-065)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, ops, passenger, passengerTwo, unlinked, driverUser] = await Promise.all([
      prisma.company.create({ data: { name: `Passenger portal ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other passenger portal ${randomUUID()}` } }),
      makeUser('Portal Ops Manager'),
      makeUser('Portal Passenger'),
      makeUser('Portal Passenger Two'),
      makeUser('Portal Unlinked Passenger'),
      makeUser('Portal Trip Driver'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    opsId = ops.id;
    passengerId = passenger.id;
    passengerTwoId = passengerTwo.id;
    unlinkedPassengerId = unlinked.id;
    driverUserId = driverUser.id;
    await assignRole(opsId, 'OPS_MANAGER');
    await assignRole(passengerId, 'PASSENGER');
    await assignRole(passengerTwoId, 'PASSENGER');
    await assignRole(unlinkedPassengerId, 'PASSENGER');
    await assignRole(driverUserId, 'DRIVER');
    const driverRecord = await prisma.driver.create({ data: { companyId, fullName: 'Portal Driver', status: 'ACTIVE' } });
    await linkDriverAccount({
      actorId: opsId, companyId, driverId: driverRecord.id, userId: driverUserId,
      reason: 'Linking the fixture driver login for event tests',
    });

    const client = await prisma.client.create({ data: { companyId, name: `Portal Client ${randomUUID().slice(0, 6)}` } });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2028-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Passenger portal test contract fixture',
    }, opsId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, opsId, companyId, draft.id);
    contractId = (await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, opsId, companyId, draft.id)).id;

    const [employee, employeeTwo] = await Promise.all([
      prisma.employee.create({
        data: {
          companyId, clientId: client.id, fullName: 'Portal Passenger Employee', transportEligible: true,
          department: 'Finance', approvedPickupLocation: 'North Gate',
        },
      }),
      prisma.employee.create({
        data: { companyId, clientId: client.id, fullName: 'Portal Second Employee', transportEligible: true },
      }),
    ]);
    employeeId = employee.id;
    employeeTwoId = employeeTwo.id;
    await linkPassengerAccount({
      actorId: opsId, companyId, employeeId, userId: passengerId, reason: 'Linking the portal passenger login',
    });
    await linkPassengerAccount({
      actorId: opsId, companyId, employeeId: employeeTwoId, userId: passengerTwoId, reason: 'Linking the second portal passenger',
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enforces the audited link rules', async () => {
    // Already linked on both sides.
    await expect(linkPassengerAccount({
      actorId: opsId, companyId, employeeId, userId: passengerId, reason: 'Trying to link twice',
    })).rejects.toBeInstanceOf(PassengerValidationError);
    // The login must hold a Passenger assignment (the ops manager does not).
    const spareEmployee = await prisma.employee.create({
      data: { companyId, clientId: (await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { clientId: true } })).clientId, fullName: 'Spare Employee', transportEligible: true },
    });
    await expect(linkPassengerAccount({
      actorId: opsId, companyId, employeeId: spareEmployee.id, userId: opsId, reason: 'Linking a non-passenger login',
    })).rejects.toBeInstanceOf(PassengerValidationError);
    // Only employee managers may link.
    await expect(linkPassengerAccount({
      actorId: passengerId, companyId, employeeId: spareEmployee.id, userId: unlinkedPassengerId, reason: 'Passenger trying to self-link',
    })).rejects.toBeInstanceOf(PermissionDeniedError);
    // Unlink cuts portal access; re-linking restores it.
    await unlinkPassengerAccount({ actorId: opsId, companyId, employeeId: employeeTwoId, reason: 'Testing the unlink path' });
    await expect(getPassengerHome({ actorId: passengerTwoId, companyId }))
      .rejects.toBeInstanceOf(PassengerNotLinkedError);
    await linkPassengerAccount({
      actorId: opsId, companyId, employeeId: employeeTwoId, userId: passengerTwoId, reason: 'Re-linking after the unlink test',
    });
    const home = await getPassengerHome({ actorId: passengerTwoId, companyId });
    expect(home.profile.fullName).toBe('Portal Second Employee');
  });

  it('denies unlinked logins and other companies', async () => {
    await expect(getPassengerHome({ actorId: unlinkedPassengerId, companyId }))
      .rejects.toBeInstanceOf(PassengerNotLinkedError);
    await expect(getPassengerHome({ actorId: passengerId, companyId: otherCompanyId }))
      .rejects.toBeInstanceOf(PassengerNotLinkedError);
  });

  it('requests journeys for the linked employee only, under booking rules', async () => {
    const booking = await requestJourney('2028-03-02');
    expect(booking.status).toBe('Pending');
    expect(booking.employeeId).toBe(employeeId);
    await expect(requestJourney('2028-03-02')).rejects.toBeInstanceOf(BookingDuplicateError);
    await expect(requestJourney('2020-01-01')).rejects.toBeInstanceOf(BookingValidationError);

    const home = await getPassengerHome({ actorId: passengerId, companyId });
    expect(home.profile.approvedPickupLocation).toBe('North Gate');
    expect(home.arrangements.contracts.map((contract) => contract.reference)).toContain(
      (await prisma.contract.findUniqueOrThrow({ where: { id: contractId }, select: { reference: true } })).reference,
    );
    const requested = home.upcoming.find((journey) => journey.bookingId === booking.id);
    expect(requested?.status).toBe('Requested');
    expect(requested?.canCancel).toBe(true);

    // Eligibility is enforced by the shared booking core.
    await prisma.employee.update({ where: { id: employeeId }, data: { transportEligible: false } });
    await expect(requestJourney('2028-03-09')).rejects.toBeInstanceOf(BookingValidationError);
    await prisma.employee.update({ where: { id: employeeId }, data: { transportEligible: true } });
  });

  it('cancels only own, unassigned journeys from the portal', async () => {
    const own = await requestJourney('2028-03-05', 'OFFICE_TO_HOME');
    const cancelled = await cancelPassengerJourney(
      { reason: 'I will work from home that day' }, passengerId, companyId, own.id,
    );
    expect(cancelled.status).toBe('Cancelled');

    // Another passenger cannot even see it as theirs.
    const other = await requestPassengerJourney(
      {
        contractId: null, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2028-03-06',
        pickupLocationId: null, dropoffLocationId: null, notes: null,
      },
      passengerTwoId, companyId,
    );
    await expect(cancelPassengerJourney(
      { reason: 'Trying to cancel someone else' }, passengerId, companyId, other.id,
    )).rejects.toBeInstanceOf(PassengerBookingNotFoundError);

    // Once operations accept it, the passenger may still cancel; the
    // companion booking stays untouched by the other passenger throughout.
    const staffBooking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2028-03-07',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Staff-created booking for cancel test',
    }, opsId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming the seat for cancel test' }, opsId, companyId, staffBooking.id);
    const acceptedCancel = await cancelPassengerJourney(
      { reason: 'Change of plans for that day' }, passengerId, companyId, staffBooking.id,
    );
    expect(acceptedCancel.status).toBe('Cancelled');
  });

  it('follows the journey through dispatch to completion and takes feedback once', async () => {
    const booking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2028-03-12',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Staff booking for the portal journey',
    }, opsId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming the portal journey seat' }, opsId, companyId, booking.id);
    const trip = await createTrip({
      clientId: (await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { clientId: true } })).clientId,
      routeId: null, serviceType: 'Staff busing', tripDate: '2028-03-12', plannedStartTime: '06:30',
      plannedDurationMinutes: 60, capacityLimit: 40, reason: 'Portal journey trip',
    }, opsId, companyId);
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `PAX-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
      },
    });
    const driverRecord = await prisma.driver.findFirstOrThrow({ where: { companyId }, select: { id: true } });
    await prisma.trip.update({ where: { id: trip.id }, data: { vehicleId: vehicle.id, driverId: driverRecord.id } });
    await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning the portal passenger' }, opsId, companyId, trip.id);

    const statusOf = async () => {
      const home = await getPassengerHome({ actorId: passengerId, companyId });
      return [...home.upcoming, ...home.history].find((journey) => journey.bookingId === booking.id)?.status;
    };
    expect(await statusOf()).toBe('Assigned to trip');
    await expect(cancelPassengerJourney(
      { reason: 'Trying to cancel an assigned journey' }, passengerId, companyId, booking.id,
    )).rejects.toBeInstanceOf(PassengerPolicyError);

    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing the portal trip' }, opsId, companyId, trip.id);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Dispatching the portal trip' }, opsId, companyId, trip.id);
    expect(await statusOf()).toBe('Driver en route');
    await postDriverEvent({ eventType: 'START', idempotencyKey: 'pax-start' }, driverUserId, companyId, trip.id);
    await postDriverEvent(
      { eventType: 'BOARD', idempotencyKey: 'pax-board', bookingId: booking.id }, driverUserId, companyId, trip.id,
    );
    expect(await statusOf()).toBe('Picked up');

    // Feedback before completion is refused.
    await expect(submitPassengerFeedback(
      { rating: 5, comment: 'Great ride so far' }, passengerId, companyId, booking.id,
    )).rejects.toBeInstanceOf(PassengerPolicyError);

    await postDriverEvent(
      { eventType: 'COMPLETE', idempotencyKey: 'pax-complete', notes: 'All passengers dropped.' }, driverUserId, companyId, trip.id,
    );
    expect(await statusOf()).toBe('Completed');
    const feedback = await submitPassengerFeedback(
      { rating: 5, comment: 'Smooth ride, on time' }, passengerId, companyId, booking.id,
    );
    expect(feedback.rating).toBe(5);
    await expect(submitPassengerFeedback(
      { rating: 1, comment: 'Trying to change my feedback' }, passengerId, companyId, booking.id,
    )).rejects.toBeInstanceOf(PassengerPolicyError);
    const home = await getPassengerHome({ actorId: passengerId, companyId });
    const completed = home.history.find((journey) => journey.bookingId === booking.id);
    expect(completed?.feedback?.comment).toBe('Smooth ride, on time');
  });
});
