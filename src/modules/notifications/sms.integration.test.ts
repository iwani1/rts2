import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking } from '../bookings/bookings';
import { linkPassengerAccount } from '../passenger/passenger';
import { listOwnNotifications, updateOwnPreferences } from './notifications';
import {
  dispatchPendingSmsNotifications,
  handleSmsDeliveryReport,
  type SmsProvider,
} from './sms';

const prisma = getPrisma();
let companyId = '';
let opsId = '';
let passengerId = '';
let employeeId = '';
let contractId = '';

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `sms-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

async function assignRole(userId: string, roleCode: string) {
  await prisma.userRoleAssignment.create({
    data: { userId, companyId, roleCode, reason: 'Integration setup', assignedById: null },
  });
}

const okProvider: SmsProvider = {
  id: 'test-ok',
  async send() {
    return { providerMessageId: 'provider-msg-1' };
  },
};
const failingProvider: SmsProvider = {
  id: 'test-fail',
  async send() {
    throw new Error('Provider down in test');
  },
};

describe('SMS fan-out and delivery pipeline (NTF-02 / D-069)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, ops, passenger] = await Promise.all([
      prisma.company.create({ data: { name: `SMS notify ${randomUUID()}` } }),
      makeUser('SMS Ops Manager'),
      makeUser('SMS Passenger'),
    ]);
    companyId = company.id;
    opsId = ops.id;
    passengerId = passenger.id;
    await assignRole(opsId, 'OPS_MANAGER');
    await assignRole(passengerId, 'PASSENGER');

    const client = await prisma.client.create({ data: { companyId, name: `SMS Client ${randomUUID().slice(0, 6)}` } });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2028-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'SMS test contract fixture',
    }, opsId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, opsId, companyId, draft.id);
    contractId = (await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, opsId, companyId, draft.id)).id;

    const employee = await prisma.employee.create({
      data: {
        companyId, clientId: client.id, fullName: 'SMS Employee', transportEligible: true,
        telephone: '+233200000001',
      },
    });
    employeeId = employee.id;
    await linkPassengerAccount({
      actorId: opsId, companyId, employeeId, userId: passengerId, reason: 'Linking the SMS passenger',
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('queues a PENDING SMS beside the in-app copy, then dispatches honestly', async () => {
    const booking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2028-07-01',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'SMS fan-out fixture booking',
    }, opsId, companyId);
    let inbox = await listOwnNotifications({ userId: passengerId, companyId });
    const sms = inbox.smsDeliveries.find((row) => row.type === 'BOOKING_CREATED');
    expect(sms).toBeDefined();
    expect(sms?.status).toBe('PENDING');
    expect(sms?.destination).toBe('+233200000001');

    // Not configured: dispatch touches nothing and admits it.
    const unconfigured = await dispatchPendingSmsNotifications({ provider: null });
    expect(unconfigured).toMatchObject({ configured: false, attempted: 0 });

    // Configured provider: PENDING -> SENT (accepted), never straight to DELIVERED.
    const result = await dispatchPendingSmsNotifications({ provider: okProvider });
    expect(result.sent).toBeGreaterThanOrEqual(1);
    inbox = await listOwnNotifications({ userId: passengerId, companyId });
    const sent = inbox.smsDeliveries.find((row) => row.notificationId === sms!.notificationId);
    expect(sent?.status).toBe('SENT');
    const stored = await prisma.notification.findUniqueOrThrow({ where: { id: sms!.notificationId } });
    expect(stored.providerMessageId).toBe('provider-msg-1');
    expect(stored.attempts).toBe(1);

    // Only the delivery confirmation marks DELIVERED.
    await expect(handleSmsDeliveryReport({
      providerMessageId: 'provider-msg-1', delivered: true,
    })).resolves.toBe(true);
    const delivered = await prisma.notification.findUniqueOrThrow({ where: { id: sms!.notificationId } });
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.status).not.toBe('SENT');
    // Unknown confirmations match nothing.
    await expect(handleSmsDeliveryReport({ providerMessageId: 'nope', delivered: true })).resolves.toBe(false);
    void booking;
  });

  it('records failures with backoff and exhausts after three attempts', async () => {
    const booking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'OFFICE_TO_HOME', journeyDate: '2028-07-02',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'SMS failure fixture booking',
    }, opsId, companyId);
    const row = await prisma.notification.findFirstOrThrow({
      where: { companyId, channel: 'SMS', entityId: booking.id, status: 'PENDING' },
    });
    const start = new Date('2028-01-01T00:00:00.000Z');
    await dispatchPendingSmsNotifications({ provider: failingProvider, now: start });
    let stored = await prisma.notification.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.status).toBe('FAILED');
    expect(stored.attempts).toBe(1);
    expect(stored.lastError).toContain('Provider down');
    expect(stored.nextAttemptAt?.valueOf()).toBeGreaterThan(start.valueOf());

    // Not retried before the backoff elapses.
    const early = await dispatchPendingSmsNotifications({ provider: okProvider, now: start });
    expect(early.attempted).toBe(0);
    // Second and third attempts exhaust retries.
    await dispatchPendingSmsNotifications({
      provider: failingProvider, now: new Date(start.valueOf() + 6 * 60_000),
    });
    await dispatchPendingSmsNotifications({
      provider: failingProvider, now: new Date(start.valueOf() + 60 * 60_000),
    });
    stored = await prisma.notification.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.attempts).toBe(3);
    expect(stored.nextAttemptAt).toBeNull();
  });

  it('queues no SMS when the SMS preference is off', async () => {
    await updateOwnPreferences(
      { inAppEnabled: true, smsEnabled: false, emailEnabled: true }, passengerId, companyId,
    );
    const booking = await createBooking({
      employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2028-07-03',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'SMS preference-off fixture',
    }, opsId, companyId);
    const count = await prisma.notification.count({
      where: { companyId, channel: 'SMS', entityId: booking.id },
    });
    expect(count).toBe(0);
    await updateOwnPreferences(
      { inAppEnabled: true, smsEnabled: true, emailEnabled: true }, passengerId, companyId,
    );
  });
});
