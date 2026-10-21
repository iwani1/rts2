import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import { linkDriverAccount, postDriverEvent } from '../driver/driver';
import { generateCorporateInvoice, transitionCorporateInvoice } from './invoices';
import {
  ProviderSignatureError,
  applyProviderPaymentEvent,
  handlePaystackWebhook,
  listProviderPaymentEvents,
} from './provider-payments';

const prisma = getPrisma();
const SECRET = 'sk_test_integration_fixture';
let companyId = '';
let financeId = '';
let managerId = '';
let invoiceId = '';
let invoiceReference = '';

function sign(body: string) {
  return createHmac('sha512', SECRET).update(body).digest('hex');
}

function chargeBody(reference: string, amount: number) {
  return JSON.stringify({
    event: 'charge.success',
    data: {
      reference, amount, currency: 'GHS', status: 'success',
      paid_at: '2027-10-15T09:30:00.000Z',
      metadata: { invoiceReference },
    },
  });
}

async function makeCompletedTrip() {
  const [client] = await prisma.client.findMany({ where: { companyId }, take: 1 });
  const [employee] = await prisma.employee.findMany({ where: { companyId }, take: 1 });
  const [driverRecord] = await prisma.driver.findMany({ where: { companyId }, take: 1 });
  const [contract] = await prisma.contract.findMany({ where: { companyId, status: 'Active' }, take: 1 });
  const [driverUser] = await prisma.user.findMany({
    where: { email: { startsWith: 'pp-driver-' } }, take: 1,
  });
  const trip = await createTrip({
    clientId: client.id, routeId: null, serviceType: null, tripDate: '2027-09-06',
    plannedStartTime: null, plannedDurationMinutes: null, capacityLimit: 40,
    reason: 'Provider payment fixture trip',
  }, managerId, companyId);
  const vehicle = await prisma.vehicle.create({
    data: {
      companyId, registrationNumber: `PP-${randomUUID().slice(0, 8).toUpperCase()}`,
      make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
    },
  });
  await prisma.trip.update({ where: { id: trip.id }, data: { vehicleId: vehicle.id, driverId: driverRecord.id } });
  const booking = await createBooking({
    employeeId: employee.id, contractId: contract.id, routeId: null, bookingType: 'HOME_TO_OFFICE',
    journeyDate: '2027-09-06', pickupLocationId: null, dropoffLocationId: null, notes: null,
    reason: 'Provider payment fixture booking',
  }, managerId, companyId);
  await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, managerId, companyId, booking.id);
  await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning passenger for fixture trip' }, managerId, companyId, trip.id);
  await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing fixture trip' }, managerId, companyId, trip.id);
  await transitionTrip({ toStatus: 'Dispatched', reason: 'Dispatching fixture trip' }, managerId, companyId, trip.id);
  await postDriverEvent({ eventType: 'START', idempotencyKey: 'pp-start' }, driverUser.id, companyId, trip.id);
  await postDriverEvent(
    { eventType: 'BOARD', idempotencyKey: 'pp-board', bookingId: booking.id }, driverUser.id, companyId, trip.id,
  );
  await postDriverEvent(
    { eventType: 'COMPLETE', idempotencyKey: 'pp-complete', notes: 'All passengers dropped.' }, driverUser.id, companyId, trip.id,
  );
}

describe('FIN-04 provider webhook inbox with PostgreSQL (D-084)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    const [company, finance, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Provider payments ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Provider Finance Officer', email: `pp-fin-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Provider Ops Manager', email: `pp-mgr-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    financeId = finance.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: financeId, companyId, roleCode: 'FINANCE_OFFICER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    const client = await prisma.client.create({ data: { companyId, name: `Provider Client ${randomUUID()}` } });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31',
      renewalDate: null, routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null,
      pricingModel: null, billingFrequency: null, paymentTerms: null, serviceLevelTargets: null,
      notes: null, reason: 'Integration test contract fixture',
    }, managerId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, managerId, companyId, draft.id);
    const contract = await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, managerId, companyId, draft.id);
    await prisma.employee.create({
      data: { companyId, clientId: client.id, fullName: 'Provider Passenger', transportEligible: true },
    });
    const driverRecord = await prisma.driver.create({ data: { companyId, fullName: 'Provider Driver', status: 'ACTIVE' } });
    const driverUser = await prisma.user.create({
      data: { name: 'Provider Trip Driver', email: `pp-driver-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: driverUser.id, companyId, roleCode: 'DRIVER', reason: 'Integration setup', assignedById: null },
    });
    await linkDriverAccount({
      actorId: managerId, companyId, driverId: driverRecord.id, userId: driverUser.id,
      reason: 'Linking the fixture driver login for event tests',
    });
    await prisma.setting.upsert({
      where: { companyId_key: { companyId, key: 'finance.corporate_rates' } },
      create: {
        companyId, key: 'finance.corporate_rates',
        value: [{ contractId: contract.id, unit: 'PER_PASSENGER', ratePesewas: 15000 }] as never, configured: true,
      },
      update: {
        value: [{ contractId: contract.id, unit: 'PER_PASSENGER', ratePesewas: 15000 }] as never, configured: true,
      },
    });
    await makeCompletedTrip();
    const generated = await generateCorporateInvoice(
      { contractId: contract.id, periodStart: '2027-09-01', periodEnd: '2027-09-30', reason: 'Generating provider invoice' },
      financeId, companyId,
    );
    invoiceId = generated.invoice.id;
    invoiceReference = generated.invoice.reference;
    await transitionCorporateInvoice(
      { toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing invoice to the client' }, financeId, companyId, invoiceId,
    );
  });

  afterAll(async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    await prisma.$disconnect();
  });

  it('rejects tampered webhooks before trusting the payload', async () => {
    const body = chargeBody('psk_tampered', 15000);
    await expect(handlePaystackWebhook(body, sign(`${body}x`)))
      .rejects.toBeInstanceOf(ProviderSignatureError);
    const events = await listProviderPaymentEvents({ actorId: financeId, companyId });
    expect(events.events.some((event) => event.providerReference === 'psk_tampered')).toBe(false);
  });

  it('records a verified charge once; repeated delivery never double-records', async () => {
    const body = chargeBody('psk_duplicate_probe', 15000);
    const first = await handlePaystackWebhook(body, sign(body));
    expect(first).toMatchObject({ duplicate: false, status: 'RECEIVED' });
    const second = await handlePaystackWebhook(body, sign(body));
    expect(second).toMatchObject({ duplicate: true, eventId: first.eventId });
    const events = await listProviderPaymentEvents({ actorId: financeId, companyId });
    expect(events.events.filter((event) => event.providerReference === 'psk_duplicate_probe')).toHaveLength(1);
    expect(await prisma.invoicePayment.count({ where: { companyId } })).toBe(0);
  });

  it('applies a staged event to the issued invoice exactly once', async () => {
    const body = chargeBody('psk_full_payment', 15000);
    const received = await handlePaystackWebhook(body, sign(body));
    const applied = await applyProviderPaymentEvent({
      actorId: financeId, companyId, eventId: received.eventId, invoiceId, reason: 'Provider payment verified in inbox',
    });
    expect(applied).toMatchObject({ outstandingPesewas: 0, invoiceStatus: 'PAID' });
    const payments = await prisma.invoicePayment.findMany({ where: { companyId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amountPesewas: 15000, reference: 'psk_full_payment', method: 'Paystack' });
    await expect(applyProviderPaymentEvent({
      actorId: financeId, companyId, eventId: received.eventId, invoiceId, reason: 'Trying to apply twice',
    })).rejects.toThrow(/only RECEIVED events can be applied/);
    expect(await prisma.invoicePayment.count({ where: { companyId } })).toBe(1);
  });
});
