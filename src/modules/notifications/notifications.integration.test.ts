import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip } from '../trips/trips';
import { linkPassengerAccount, requestPassengerJourney } from '../passenger/passenger';
import { linkCustomerAccount } from '../rental-portal/portal';
import {
  createRentalRequestForLinkedCustomer,
  submitOwnRentalRequest,
  transitionRentalRequest,
} from '../rentals/rental-requests';
import {
  listOwnNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationNotFoundError,
  notifyUserInTransaction,
  updateOwnPreferences,
} from './notifications';

const prisma = getPrisma();
let companyId = '';
let opsId = '';
let passengerId = '';
let otherPassengerId = '';
let customerUserId = '';
let clientId = '';
let employeeId = '';
let contractId = '';
let customerId = '';

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `ntf-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

async function assignRole(userId: string, roleCode: string) {
  await prisma.userRoleAssignment.create({
    data: { userId, companyId, roleCode, reason: 'Integration setup', assignedById: null },
  });
}

describe('in-app notification service (NTF-01 / D-068)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, ops, passenger, otherPassenger, customerUser] = await Promise.all([
      prisma.company.create({ data: { name: `Notifications ${randomUUID()}` } }),
      makeUser('Notify Ops Manager'),
      makeUser('Notify Passenger'),
      makeUser('Notify Other Passenger'),
      makeUser('Notify Customer'),
    ]);
    companyId = company.id;
    opsId = ops.id;
    passengerId = passenger.id;
    otherPassengerId = otherPassenger.id;
    customerUserId = customerUser.id;
    await assignRole(opsId, 'OPS_MANAGER');
    await assignRole(passengerId, 'PASSENGER');
    await assignRole(otherPassengerId, 'PASSENGER');
    await assignRole(customerUserId, 'RENTAL_CUSTOMER');

    const client = await prisma.client.create({ data: { companyId, name: `Notify Client ${randomUUID().slice(0, 6)}` } });
    clientId = client.id;
    const draft = await createContract({
      clientId, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2028-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Notification test contract fixture',
    }, opsId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, opsId, companyId, draft.id);
    contractId = (await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, opsId, companyId, draft.id)).id;

    const employee = await prisma.employee.create({
      data: { companyId, clientId, fullName: 'Notify Employee', transportEligible: true },
    });
    employeeId = employee.id;
    await linkPassengerAccount({
      actorId: opsId, companyId, employeeId, userId: passengerId, reason: 'Linking the notify passenger',
    });
    const customer = await prisma.customer.create({ data: { companyId, displayName: 'Notify Rentals Ltd' } });
    customerId = customer.id;
    await linkCustomerAccount({
      actorId: opsId, companyId, customerId, userId: customerUserId, reason: 'Linking the notify customer',
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('notifies the linked passenger across the booking lifecycle, never the actor', async () => {
    const booking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2028-06-01',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Staff booking to notify about',
    }, opsId, companyId);
    let inbox = await listOwnNotifications({ userId: passengerId, companyId });
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.notifications[0]?.type).toBe('BOOKING_CREATED');
    expect(inbox.notifications[0]?.entityId).toBe(booking.id);

    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming for notify test' }, opsId, companyId, booking.id);
    inbox = await listOwnNotifications({ userId: passengerId, companyId });
    expect(inbox.unreadCount).toBe(2);
    expect(inbox.notifications[0]?.title).toContain('confirmed');

    const trip = await createTrip({
      clientId, routeId: null, serviceType: 'Staff busing', tripDate: '2028-06-01',
      plannedStartTime: '06:30', plannedDurationMinutes: 60, capacityLimit: 40,
      reason: 'Notify assignment trip fixture',
    }, opsId, companyId);
    await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning for notify test' }, opsId, companyId, trip.id);
    inbox = await listOwnNotifications({ userId: passengerId, companyId });
    expect(inbox.unreadCount).toBe(3);
    expect(inbox.notifications[0]?.type).toBe('BOOKING_ASSIGNED_TO_TRIP');

    // The passenger's own portal request must not notify themselves.
    await requestPassengerJourney(
      {
        contractId: null, routeId: null, bookingType: 'OFFICE_TO_HOME', journeyDate: '2028-06-02',
        pickupLocationId: null, dropoffLocationId: null, notes: null,
      },
      passengerId, companyId,
    );
    inbox = await listOwnNotifications({ userId: passengerId, companyId });
    expect(inbox.totalCount).toBe(3);

    // Other users see nothing of this.
    const other = await listOwnNotifications({ userId: otherPassengerId, companyId });
    expect(other.totalCount).toBe(0);
    const opsInbox = await listOwnNotifications({ userId: opsId, companyId });
    expect(opsInbox.totalCount).toBe(0);
  });

  it('suppresses duplicate events by dedupe key', async () => {
    const input = {
      companyId, userId: passengerId, type: 'TEST_EVENT', title: 'Test', body: 'Body',
      entityType: 'BOOKING', entityId: 'dup-check', dedupeKey: 'test:dup:1',
    };
    const first = await prisma.$transaction((tx) => notifyUserInTransaction(tx, input));
    const second = await prisma.$transaction((tx) => notifyUserInTransaction(tx, input));
    expect(first).toBe(true);
    expect(second).toBe(false);
    const inbox = await listOwnNotifications({ userId: passengerId, companyId });
    expect(inbox.notifications.filter((row) => row.entityId === 'dup-check')).toHaveLength(1);
    await markAllNotificationsRead({ userId: passengerId, companyId });
  });

  it('honours the in-app preference switch', async () => {
    await updateOwnPreferences(
      { inAppEnabled: false, smsEnabled: true, emailEnabled: true }, passengerId, companyId,
    );
    const booking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2028-06-03',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Booking while muted',
    }, opsId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming while muted' }, opsId, companyId, booking.id);
    const inbox = await listOwnNotifications({ userId: passengerId, companyId });
    expect(inbox.notifications.some((row) => row.entityId === booking.id)).toBe(false);

    await updateOwnPreferences(
      { inAppEnabled: true, smsEnabled: true, emailEnabled: true }, passengerId, companyId,
    );
    await transitionBooking({ toStatus: 'Cancelled', reason: 'Cancelling after unmute' }, opsId, companyId, booking.id);
    const after = await listOwnNotifications({ userId: passengerId, companyId });
    expect(after.notifications.some((row) => row.entityId === booking.id && row.type === 'BOOKING_STATUS_CHANGED')).toBe(true);
  });

  it('marks read only for the owner', async () => {
    const inbox = await listOwnNotifications({ userId: passengerId, companyId });
    const target = inbox.notifications.find((row) => row.readAt === null);
    expect(target).toBeDefined();
    await expect(markNotificationRead({
      userId: otherPassengerId, companyId, notificationId: target!.notificationId,
    })).rejects.toBeInstanceOf(NotificationNotFoundError);
    await markNotificationRead({
      userId: passengerId, companyId, notificationId: target!.notificationId,
    });
    const after = await listOwnNotifications({ userId: passengerId, companyId });
    expect(after.notifications.find((row) => row.notificationId === target!.notificationId)?.readAt).not.toBeNull();
  });

  it('notifies the linked customer on rental review transitions', async () => {
    const draft = await createRentalRequestForLinkedCustomer(
      {
        serviceDate: '2028-06-10', departureTime: '09:00', returnTime: '17:00', durationMinutes: null,
        pickupLocation: 'Accra Mall', destination: 'Cape Coast', intermediateStops: null,
        passengerCount: 12, luggageSpecialNeeds: null, purpose: 'Tour', requestedVehicleType: 'Coaster',
        driverRequirement: null, tripContactName: null, tripContactTelephone: null,
        tripContactEmail: null, notes: null, reason: 'Customer enquiry for notify test',
      },
      customerUserId, companyId, customerId,
    );
    await submitOwnRentalRequest(
      { reason: 'Submitting for review notify' }, customerUserId, companyId, draft.id, customerId,
    );
    await transitionRentalRequest(
      { toStatus: 'Under Review', reason: 'Operations reviewing now' }, opsId, companyId, draft.id,
    );
    let inbox = await listOwnNotifications({ userId: customerUserId, companyId });
    expect(inbox.notifications.some(
      (row) => row.type === 'RENTAL_REQUEST_STATUS_CHANGED' && row.entityId === draft.id,
    )).toBe(true);
    await transitionRentalRequest(
      { toStatus: 'Declined', reason: 'No vehicle for that date' }, opsId, companyId, draft.id,
    );
    inbox = await listOwnNotifications({ userId: customerUserId, companyId });
    expect(inbox.notifications.filter(
      (row) => row.type === 'RENTAL_REQUEST_STATUS_CHANGED' && row.entityId === draft.id,
    )).toHaveLength(2);
  });
});
