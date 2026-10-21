import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking } from '../bookings/bookings';
import { linkPassengerAccount } from '../passenger/passenger';
import { listOwnNotifications, updateOwnPreferences } from './notifications';
import { dispatchPendingEmailNotifications, type EmailProvider } from './email';

const prisma = getPrisma();
let companyId = '';
let opsId = '';
let passengerId = '';
let passengerEmail = '';
let employeeId = '';
let contractId = '';

async function makeUser(name: string) {
  const email = `mail-${randomUUID()}@example.invalid`;
  const user = await prisma.user.create({
    data: { name, email, status: 'ACTIVE' },
  });
  return { user, email };
}

async function assignRole(userId: string, roleCode: string) {
  await prisma.userRoleAssignment.create({
    data: { userId, companyId, roleCode, reason: 'Integration setup', assignedById: null },
  });
}

const okProvider: EmailProvider = {
  id: 'test-ok',
  async send() {
    return { providerMessageId: 'mail-msg-1' };
  },
};
const failingProvider: EmailProvider = {
  id: 'test-fail',
  async send() {
    throw new Error('SMTP down in test');
  },
};

describe('email fan-out and dispatch (NTF-03 / D-070)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, ops, passenger] = await Promise.all([
      prisma.company.create({ data: { name: `Email notify ${randomUUID()}` } }),
      makeUser('Email Ops Manager'),
      makeUser('Email Passenger'),
    ]);
    companyId = company.id;
    opsId = ops.user.id;
    passengerId = passenger.user.id;
    passengerEmail = passenger.email;
    await assignRole(opsId, 'OPS_MANAGER');
    await assignRole(passengerId, 'PASSENGER');

    const client = await prisma.client.create({ data: { companyId, name: `Email Client ${randomUUID().slice(0, 6)}` } });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2028-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Email test contract fixture',
    }, opsId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, opsId, companyId, draft.id);
    contractId = (await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, opsId, companyId, draft.id)).id;

    const employee = await prisma.employee.create({
      data: { companyId, clientId: client.id, fullName: 'Email Employee', transportEligible: true },
    });
    employeeId = employee.id;
    await linkPassengerAccount({
      actorId: opsId, companyId, employeeId, userId: passengerId, reason: 'Linking the email passenger',
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('queues a PENDING email to the login address and dispatches to SENT only', async () => {
    const booking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2028-08-01',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Email fan-out fixture booking',
    }, opsId, companyId);
    const inbox = await listOwnNotifications({ userId: passengerId, companyId });
    const email = inbox.emailDeliveries.find((row) => row.type === 'BOOKING_CREATED');
    expect(email).toBeDefined();
    expect(email?.destination).toBe(passengerEmail);
    expect(email?.status).toBe('PENDING');

    const unconfigured = await dispatchPendingEmailNotifications({ provider: null });
    expect(unconfigured).toMatchObject({ configured: false, attempted: 0 });

    const result = await dispatchPendingEmailNotifications({ provider: okProvider });
    expect(result.sent).toBeGreaterThanOrEqual(1);
    const stored = await prisma.notification.findUniqueOrThrow({ where: { id: email!.notificationId } });
    // Email's strongest honest state: handed to the mail server.
    expect(stored.status).toBe('SENT');
    expect(stored.providerMessageId).toBe('mail-msg-1');
    void booking;
  });

  it('records SMTP failures with backoff', async () => {
    const booking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'OFFICE_TO_HOME', journeyDate: '2028-08-02',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Email failure fixture booking',
    }, opsId, companyId);
    const row = await prisma.notification.findFirstOrThrow({
      where: { companyId, channel: 'EMAIL', entityId: booking.id, status: 'PENDING' },
    });
    const start = new Date('2028-01-01T00:00:00.000Z');
    await dispatchPendingEmailNotifications({ provider: failingProvider, now: start });
    const stored = await prisma.notification.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.status).toBe('FAILED');
    expect(stored.attempts).toBe(1);
    expect(stored.lastError).toContain('SMTP down');
    expect(stored.nextAttemptAt?.valueOf()).toBeGreaterThan(start.valueOf());
  });

  it('queues no email when the email preference is off', async () => {
    await updateOwnPreferences(
      { inAppEnabled: true, smsEnabled: true, emailEnabled: false }, passengerId, companyId,
    );
    const booking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2028-08-03',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Email preference-off fixture',
    }, opsId, companyId);
    const count = await prisma.notification.count({
      where: { companyId, channel: 'EMAIL', entityId: booking.id },
    });
    expect(count).toBe(0);
    await updateOwnPreferences(
      { inAppEnabled: true, smsEnabled: true, emailEnabled: true }, passengerId, companyId,
    );
  });
});
