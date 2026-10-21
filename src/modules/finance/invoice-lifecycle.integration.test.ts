import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import { linkDriverAccount, postDriverEvent } from '../driver/driver';
import {
  InvoicePolicyError,
  InvoiceTransitionNotAllowedError,
  PaymentExceedsBalanceError,
  generateCorporateInvoice,
  getCorporateInvoice,
  listCorporateInvoices,
  recordInvoicePayment,
  transitionCorporateInvoice,
} from './invoices';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let financeId = '';
let managerId = '';
let driverUserId = '';
let clientId = '';
let contractId = '';
let employeeId = '';
let driverRecordId = '';
let invoiceAId = '';
let invoiceBId = '';
let invoiceCId = '';
let invoiceDId = '';

const PERIODS = {
  a: { periodStart: '2027-09-01', periodEnd: '2027-09-30' },
  b: { periodStart: '2027-10-01', periodEnd: '2027-10-31' },
  c: { periodStart: '2027-11-01', periodEnd: '2027-11-30' },
  d: { periodStart: '2027-12-01', periodEnd: '2027-12-31' },
};

function pay(invoiceId: string, amountPesewas: number) {
  return recordInvoicePayment(
    {
      amountPesewas, method: 'Bank transfer', reference: 'TEST-REF',
      receivedAt: '2027-10-15', reason: 'Recording a client payment',
    },
    financeId, companyId, invoiceId,
  );
}

async function makeCompletedTrip(journeyDate: string, keyPrefix: string) {
  const trip = await createTrip({
    clientId, routeId: null, serviceType: null, tripDate: journeyDate, plannedStartTime: null,
    plannedDurationMinutes: null, capacityLimit: 40, reason: 'Lifecycle fixture trip',
  }, managerId, companyId);
  const vehicle = await prisma.vehicle.create({
    data: {
      companyId, registrationNumber: `LCY-${randomUUID().slice(0, 8).toUpperCase()}`,
      make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
    },
  });
  await prisma.trip.update({ where: { id: trip.id }, data: { vehicleId: vehicle.id, driverId: driverRecordId } });
  const booking = await createBooking({
    employeeId, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate,
    pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Lifecycle fixture booking',
  }, managerId, companyId);
  await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, managerId, companyId, booking.id);
  await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning passenger for lifecycle trip' }, managerId, companyId, trip.id);
  await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing lifecycle fixture trip' }, managerId, companyId, trip.id);
  await transitionTrip({ toStatus: 'Dispatched', reason: 'Dispatching lifecycle fixture trip' }, managerId, companyId, trip.id);
  await postDriverEvent({ eventType: 'START', idempotencyKey: `${keyPrefix}-start` }, driverUserId, companyId, trip.id);
  await postDriverEvent(
    { eventType: 'BOARD', idempotencyKey: `${keyPrefix}-board`, bookingId: booking.id }, driverUserId, companyId, trip.id,
  );
  await postDriverEvent(
    { eventType: 'COMPLETE', idempotencyKey: `${keyPrefix}-complete`, notes: 'All passengers dropped.' },
    driverUserId, companyId, trip.id,
  );
}

describe('corporate invoice lifecycle and payments with PostgreSQL persistence (D-061/D-062)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, finance, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Invoice lifecycle ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other invoice lifecycle ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Lifecycle Finance Officer', email: `lcy-fin-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Lifecycle Ops Manager', email: `lcy-mgr-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    financeId = finance.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: financeId, companyId, roleCode: 'FINANCE_OFFICER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    const client = await prisma.client.create({ data: { companyId, name: `Lifecycle Client ${randomUUID()}` } });
    clientId = client.id;
    const draft = await createContract({
      clientId, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Integration test contract fixture',
    }, managerId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, managerId, companyId, draft.id);
    const active = await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, managerId, companyId, draft.id);
    contractId = active.id;
    const employee = await prisma.employee.create({
      data: { companyId, clientId, fullName: 'Lifecycle Passenger', transportEligible: true },
    });
    employeeId = employee.id;
    const driverRecord = await prisma.driver.create({ data: { companyId, fullName: 'Lifecycle Driver', status: 'ACTIVE' } });
    driverRecordId = driverRecord.id;
    const driverUser = await prisma.user.create({
      data: { name: 'Lifecycle Trip Driver', email: `lcy-driver-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    driverUserId = driverUser.id;
    await prisma.userRoleAssignment.create({
      data: { userId: driverUserId, companyId, roleCode: 'DRIVER', reason: 'Integration setup', assignedById: null },
    });
    await linkDriverAccount({
      actorId: managerId, companyId, driverId: driverRecordId, userId: driverUserId,
      reason: 'Linking the fixture driver login for event tests',
    });
    await prisma.setting.upsert({
      where: { companyId_key: { companyId, key: 'finance.corporate_rates' } },
      create: {
        companyId, key: 'finance.corporate_rates',
        value: [{ contractId, unit: 'PER_PASSENGER', ratePesewas: 15000 }] as never, configured: true,
      },
      update: {
        value: [{ contractId, unit: 'PER_PASSENGER', ratePesewas: 15000 }] as never, configured: true,
      },
    });
    await makeCompletedTrip('2027-09-06', 'lcy-a');
    await makeCompletedTrip('2027-10-04', 'lcy-b');
    await makeCompletedTrip('2027-11-01', 'lcy-c');
    await makeCompletedTrip('2027-12-06', 'lcy-d');
    invoiceAId = (await generateCorporateInvoice({ contractId, ...PERIODS.a, reason: 'Generating lifecycle invoice A' }, financeId, companyId)).invoice.id;
    invoiceBId = (await generateCorporateInvoice({ contractId, ...PERIODS.b, reason: 'Generating lifecycle invoice B' }, financeId, companyId)).invoice.id;
    invoiceCId = (await generateCorporateInvoice({ contractId, ...PERIODS.c, reason: 'Generating lifecycle invoice C' }, financeId, companyId)).invoice.id;
    invoiceDId = (await generateCorporateInvoice({ contractId, ...PERIODS.d, reason: 'Generating lifecycle invoice D' }, financeId, companyId)).invoice.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('issues an invoice and auto-marks it PAID when payments reach the total', async () => {
    const issued = await transitionCorporateInvoice(
      { toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing invoice A to the client' }, financeId, companyId, invoiceAId,
    );
    expect(issued.status).toBe('ISSUED');
    expect(issued.outstandingPesewas).toBe(15000);
    const result = await pay(invoiceAId, 15000);
    expect(result.outstandingPesewas).toBe(0);
    expect(result.invoice.status).toBe('PAID');
    expect(result.invoice.paidPesewas).toBe(15000);
    const detail = await getCorporateInvoice({ actorId: financeId, companyId, invoiceId: invoiceAId });
    expect(detail.payments).toHaveLength(1);
    expect(detail.history.map((entry) => entry.toStatus)).toEqual(['DRAFT', 'ISSUED', 'PAID']);
    expect(detail.history.map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    await expect(pay(invoiceAId, 100)).rejects.toBeInstanceOf(InvoicePolicyError);
    await expect(transitionCorporateInvoice(
      { toStatus: 'VOID', reason: 'Trying to void a paid invoice' }, financeId, companyId, invoiceAId,
    )).rejects.toBeInstanceOf(InvoiceTransitionNotAllowedError);
  });

  it('refuses overpayment, serialises parallel payments, and refuses voiding once payments exist', async () => {
    await transitionCorporateInvoice(
      { toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing invoice B to the client' }, financeId, companyId, invoiceBId,
    );
    const first = await pay(invoiceBId, 5000);
    expect(first.outstandingPesewas).toBe(10000);
    await expect(pay(invoiceBId, 10001)).rejects.toBeInstanceOf(PaymentExceedsBalanceError);
    await expect(transitionCorporateInvoice(
      { toStatus: 'VOID', reason: 'Trying to void invoice B after a payment' }, financeId, companyId, invoiceBId,
    )).rejects.toBeInstanceOf(InvoicePolicyError);
    const settled = await Promise.allSettled([pay(invoiceBId, 6000), pay(invoiceBId, 6000)]);
    expect(settled.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((entry) => entry.status === 'rejected')).toHaveLength(1);
    const final = await pay(invoiceBId, 4000);
    expect(final.outstandingPesewas).toBe(0);
    expect(final.invoice.status).toBe('PAID');
  });

  it('voiding releases the trips and the contract period for a replacement invoice', async () => {
    await transitionCorporateInvoice(
      { toStatus: 'VOID', reason: 'Invoice C was raised in error' }, financeId, companyId, invoiceCId,
    );
    const replacement = await generateCorporateInvoice(
      { contractId, ...PERIODS.c, reason: 'Replacing the voided invoice C' }, financeId, companyId,
    );
    expect(replacement.duplicate).toBe(false);
    expect(replacement.invoice.id).not.toBe(invoiceCId);
    expect(replacement.invoice.status).toBe('DRAFT');
    expect(replacement.invoice.lines).toHaveLength(1);
    await transitionCorporateInvoice(
      { toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing the replacement invoice' }, financeId, companyId, replacement.invoice.id,
    );
    const voided = await transitionCorporateInvoice(
      { toStatus: 'VOID', reason: 'Client disputed the replacement before paying' }, financeId, companyId, replacement.invoice.id,
    );
    expect(voided.status).toBe('VOID');
    const voidInvoices = await listCorporateInvoices({ actorId: financeId, companyId, status: 'VOID' });
    expect(voidInvoices.invoices.map((invoice) => invoice.id)).toContain(invoiceCId);
    const third = await generateCorporateInvoice(
      { contractId, ...PERIODS.c, reason: 'Billing period C for the third time' }, financeId, companyId,
    );
    expect(third.duplicate).toBe(false);
    expect(third.invoice.id).not.toBe(replacement.invoice.id);
  });

  it('rejects illegal transitions, draft payments, read-only actors and cross-company access', async () => {
    await expect(transitionCorporateInvoice(
      { toStatus: 'PAID', reason: 'Trying to skip issuance entirely' }, financeId, companyId, invoiceDId,
    )).rejects.toBeInstanceOf(InvoiceTransitionNotAllowedError);
    await expect(pay(invoiceDId, 100)).rejects.toBeInstanceOf(InvoicePolicyError);
    await expect(transitionCorporateInvoice(
      { toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Read-only manager attempting issuance' }, managerId, companyId, invoiceDId,
    )).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(transitionCorporateInvoice(
      { toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing across a company boundary' }, financeId, otherCompanyId, invoiceDId,
    )).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(recordInvoicePayment(
      {
        amountPesewas: 100, method: null, reference: null, receivedAt: '2027-12-10',
        reason: 'Paying across a company boundary',
      },
      financeId, otherCompanyId, invoiceDId,
    )).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('enforces the lifecycle at the database layer', async () => {
    // DRAFT -> PAID is not an approved transition.
    await expect(prisma.corporateInvoice.update({
      where: { id: invoiceDId }, data: { status: 'PAID' },
    })).rejects.toThrow();
    // Amounts are immutable even for direct writes.
    await expect(prisma.corporateInvoice.update({
      where: { id: invoiceDId }, data: { totalPesewas: 1 },
    })).rejects.toThrow();
    // A status change without a matching history row is rejected at commit.
    await expect(prisma.corporateInvoice.update({
      where: { id: invoiceDId }, data: { status: 'ISSUED' },
    })).rejects.toThrow();
    // Payments cannot be inserted against a DRAFT invoice.
    await expect(prisma.invoicePayment.create({
      data: {
        companyId, invoiceId: invoiceDId, amountPesewas: 100, receivedAt: new Date('2027-12-10'),
        reason: 'Direct insert against a draft', recordedById: financeId,
      },
    })).rejects.toThrow();
    // Recorded payments are append-only.
    const payment = await prisma.invoicePayment.findFirst({ where: { companyId, invoiceId: invoiceAId } });
    expect(payment).not.toBeNull();
    await expect(prisma.invoicePayment.delete({ where: { id: payment!.id } })).rejects.toThrow();
    await expect(prisma.invoicePayment.update({
      where: { id: payment!.id }, data: { amountPesewas: 1 },
    })).rejects.toThrow();
  });

  it('supports manually marking an issued invoice PAID with a reason', async () => {
    await transitionCorporateInvoice(
      { toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing invoice D to the client' }, financeId, companyId, invoiceDId,
    );
    const paid = await transitionCorporateInvoice(
      { toStatus: 'PAID', reason: 'Client settled outside the payment ledger' }, financeId, companyId, invoiceDId,
    );
    expect(paid.status).toBe('PAID');
    const detail = await getCorporateInvoice({ actorId: financeId, companyId, invoiceId: invoiceDId });
    expect(detail.history.map((entry) => entry.toStatus)).toEqual(['DRAFT', 'ISSUED', 'PAID']);
  });
});
