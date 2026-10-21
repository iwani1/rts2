import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import { linkDriverAccount, postDriverEvent } from '../driver/driver';
import { generateCorporateInvoice, transitionCorporateInvoice } from './invoices';
import { applyProviderPaymentEvent, handlePaystackWebhook } from './provider-payments';
import {
  ReconciliationPolicyError,
  ReconciliationTransitionNotAllowedError,
  createReconciliation,
  listReconciliations,
  transitionReconciliation,
} from './reconciliations';

const prisma = getPrisma();
const SECRET = 'sk_test_reconciliation_fixture';
let companyId = '';
let creatorId = '';
let closerId = '';
let managerId = '';
let invoiceId = '';
let invoiceReference = '';
let driverUserId = '';

function sign(body: string) {
  return createHmac('sha512', SECRET).update(body).digest('hex');
}

describe('FIN-08 reconciliation runs with PostgreSQL (D-085)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    const [company, creator, closer, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Reconciliation ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Recon Creator', email: `rec-a-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Recon Closer', email: `rec-b-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Recon Manager', email: `rec-m-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    creatorId = creator.id;
    closerId = closer.id;
    managerId = manager.id;
    for (const [userId, roleCode] of [[creator.id, 'FINANCE_OFFICER'], [closer.id, 'FINANCE_OFFICER'], [manager.id, 'OPS_MANAGER']] as const) {
      await prisma.userRoleAssignment.create({
        data: { userId, companyId, roleCode, reason: 'Integration setup', assignedById: null },
      });
    }
    const client = await prisma.client.create({ data: { companyId, name: `Recon Client ${randomUUID()}` } });
    const draft = await createContract({
      clientId: client.id, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31',
      renewalDate: null, routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null,
      pricingModel: null, billingFrequency: null, paymentTerms: null, serviceLevelTargets: null,
      notes: null, reason: 'Reconciliation fixture contract',
    }, managerId, companyId);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, managerId, companyId, draft.id);
    const contract = await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, managerId, companyId, draft.id);
    const employee = await prisma.employee.create({
      data: { companyId, clientId: client.id, fullName: 'Recon Passenger', transportEligible: true },
    });
    const driverRecord = await prisma.driver.create({ data: { companyId, fullName: 'Recon Driver', status: 'ACTIVE' } });
    const driverUser = await prisma.user.create({
      data: { name: 'Recon Trip Driver', email: `rec-d-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    driverUserId = driverUser.id;
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
    const trip = await createTrip({
      clientId: client.id, routeId: null, serviceType: null, tripDate: '2027-09-06',
      plannedStartTime: null, plannedDurationMinutes: null, capacityLimit: 40,
      reason: 'Reconciliation fixture trip',
    }, managerId, companyId);
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `REC-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
      },
    });
    await prisma.trip.update({ where: { id: trip.id }, data: { vehicleId: vehicle.id, driverId: driverRecord.id } });
    const booking = await createBooking({
      employeeId: employee.id, contractId: contract.id, routeId: null, bookingType: 'HOME_TO_OFFICE',
      journeyDate: '2027-09-06', pickupLocationId: null, dropoffLocationId: null, notes: null,
      reason: 'Reconciliation fixture booking',
    }, managerId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, managerId, companyId, booking.id);
    await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning passenger for fixture trip' }, managerId, companyId, trip.id);
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing fixture trip' }, managerId, companyId, trip.id);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Dispatching fixture trip' }, managerId, companyId, trip.id);
    await postDriverEvent({ eventType: 'START', idempotencyKey: 'rec-start' }, driverUserId, companyId, trip.id);
    await postDriverEvent(
      { eventType: 'BOARD', idempotencyKey: 'rec-board', bookingId: booking.id }, driverUserId, companyId, trip.id,
    );
    await postDriverEvent(
      { eventType: 'COMPLETE', idempotencyKey: 'rec-complete', notes: 'All passengers dropped.' }, driverUserId, companyId, trip.id,
    );
    const generated = await generateCorporateInvoice(
      { contractId: contract.id, periodStart: '2027-09-01', periodEnd: '2027-09-30', reason: 'Generating reconciliation invoice' },
      creatorId, companyId,
    );
    invoiceId = generated.invoice.id;
    invoiceReference = generated.invoice.reference;
    await transitionCorporateInvoice(
      { toStatus: 'ISSUED', reason: 'Issuing invoice to the client' }, creatorId, companyId, invoiceId,
    );
  });

  afterAll(async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    await prisma.$disconnect();
  });

  it('tracks an unapplied provider payment as a discrepancy until it is applied and independently closed', async () => {
    const body = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: 'psk_recon_1', amount: 15000, currency: 'GHS', status: 'success',
        paid_at: '2027-09-20T08:00:00.000Z', metadata: { invoiceReference },
      },
    });
    const webhook = await handlePaystackWebhook(body, sign(body));
    expect(webhook.status).toBe('RECEIVED');

    const run = await createReconciliation({
      actorId: creatorId, companyId, periodStart: '2027-09-01', periodEnd: '2027-09-30',
      reason: 'September provider reconciliation',
    });
    expect(run.status).toBe('OPEN');
    expect(run.summary.reconciles).toBe(false);
    expect(run.summary.discrepancies.unappliedProviderEvents).toHaveLength(1);

    const applied = await applyProviderPaymentEvent({
      actorId: creatorId, companyId, eventId: webhook.eventId, invoiceId, reason: 'Applying after reconciliation review',
    });
    expect(applied.invoiceStatus).toBe('PAID');

    await expect(transitionReconciliation({
      actorId: creatorId, companyId, reconciliationId: run.id, toStatus: 'CLOSED', reason: 'Closing my own run',
    })).rejects.toBeInstanceOf(ReconciliationPolicyError);

    const closed = await transitionReconciliation({
      actorId: closerId, companyId, reconciliationId: run.id, toStatus: 'CLOSED', reason: 'Provider records match bookings',
    });
    expect(closed.summary.reconciles).toBe(true);
    expect(closed.summary.providerAppliedPesewas).toBe(15000);

    await expect(transitionReconciliation({
      actorId: closerId, companyId, reconciliationId: run.id, toStatus: 'CLOSED', reason: 'Trying to close twice',
    })).rejects.toBeInstanceOf(ReconciliationTransitionNotAllowedError);

    const listed = await listReconciliations({ actorId: closerId, companyId });
    const stored = listed.reconciliations.find((row) => row.id === run.id);
    expect(stored?.status).toBe('CLOSED');
    expect(stored?.summary.reconciles).toBe(true);
    expect(stored?.statusHistory.map((event) => event.toStatus)).toEqual(['OPEN', 'CLOSED']);
  });
});
