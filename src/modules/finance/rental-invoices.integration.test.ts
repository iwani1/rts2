import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignRole } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { createRentalRequest, submitRentalRequest, transitionRentalRequest } from '@/modules/rentals/rental-requests';
import { createRentalPricingWorksheet } from '@/modules/rentals/pricing-worksheets';
import {
  assignRentalDriver,
  confirmRentalRequest,
  decideRentalCompletion,
  submitRentalCompletion,
} from '@/modules/rentals/rental-lifecycle';
import { getFinanceDashboard } from './dashboard';
import {
  RentalInvoicePaymentExceedsError,
  createRentalInvoice,
  getRentalInvoice,
  recordRentalInvoicePayment,
  transitionRentalInvoice,
} from './rental-invoices';

const prisma = getPrisma();
let companyId = '';
let opsId = '';
let approverId = '';
let financeId = '';
let vehicleId = '';

async function makeUser(name: string) {
  return prisma.user.create({ data: { name, email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } });
}

function setSetting(key: string, value: unknown) {
  return prisma.setting.upsert({
    where: { companyId_key: { companyId, key } },
    create: { companyId, key, configured: true, value: value as never },
    update: { configured: true, value: value as never },
  });
}

async function completedRequest(input: { depositReceivedPesewas: number; proposedChargesPesewas: number; approvedChargesPesewas: number }) {
  const customer = await prisma.customer.create({ data: { companyId, displayName: `Invoice customer ${randomUUID().slice(0, 6)}` } });
  const request = await createRentalRequest({
    customerId: customer.id, serviceDate: '2027-02-10', departureTime: '08:00', returnTime: null, returnDate: null,
    durationMinutes: 90, pickupLocation: 'Osu', destination: 'Tema Port', intermediateStops: null,
    passengerCount: 2, luggageSpecialNeeds: null, purpose: null, requestedVehicleType: null,
    driverRequirement: null, tripContactName: null, tripContactTelephone: null, tripContactEmail: null,
    notes: null, requestSource: 'PHONE', reason: 'Create request for invoice integration',
  }, opsId, companyId);
  await submitRentalRequest({ reason: 'Submit for invoice integration' }, opsId, companyId, request.id);
  await transitionRentalRequest({ toStatus: 'Under Review', reason: 'Begin invoice review' }, opsId, companyId, request.id);
  await createRentalPricingWorksheet({ actorId: opsId, companyId, requestId: request.id, modelCodes: ['HOUR'], reason: 'Internal estimate' });
  await confirmRentalRequest(opsId, companyId, request.id, {
    vehicleId, acceptedByName: 'Ama Serwaa', acceptanceAt: '2027-02-01', acceptanceReference: 'Email acceptance',
    reason: 'Customer accepted and vehicle reserved',
  });
  await assignRentalDriver(opsId, companyId, request.id, {
    driverId: (await prisma.driver.create({ data: { companyId, fullName: `Driver ${randomUUID().slice(0, 6)}`, status: 'ACTIVE' } })).id,
  });
  const completion = await submitRentalCompletion(opsId, companyId, request.id, {
    actualDepartureAt: '2027-02-10T08:05:00.000Z', actualReturnAt: '2027-02-10T09:40:00.000Z',
    vehicleReturnedAt: '2027-02-10T09:45:00.000Z', depositReceivedPesewas: input.depositReceivedPesewas,
    additionalChargesPesewas: input.proposedChargesPesewas, chargesDescription: 'Extra waiting time',
  });
  await decideRentalCompletion(approverId, companyId, request.id, completion.id, {
    decision: 'APPROVE', reason: 'Verified against the trip report', correctedChargesPesewas: input.approvedChargesPesewas,
  });
  return request.id;
}

describe('Phase 5A rental invoices with PostgreSQL (D-090)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, admin, ops, approver, finance] = await Promise.all([
      prisma.company.create({ data: { name: `Rental invoices ${randomUUID()}` } }),
      makeUser('Invoice admin'), makeUser('Invoice ops'), makeUser('Invoice approver'), makeUser('Invoice finance'),
    ]);
    companyId = company.id;
    opsId = ops.id;
    approverId = approver.id;
    financeId = finance.id;
    await prisma.userRoleAssignment.create({
      data: { userId: admin.id, roleCode: 'SUPER_ADMIN', assignedById: admin.id, reason: 'Invoice integration administrator' },
    });
    for (const [user, roleCode] of [[ops, 'OPS_MANAGER'], [approver, 'OPS_MANAGER'], [finance, 'FINANCE_OFFICER']] as const) {
      await assignRole({ actorId: admin.id, targetUserId: user.id, companyId, roleCode, reason: 'Invoice integration role' });
    }
    await setSetting('rental.pricing_models', [{ code: 'HOUR', label: 'Hourly rate', unit: 'PER_HOUR', ratePesewas: 6000 }]);
    await setSetting('rental.deposit_policy', { kind: 'NOT_REQUIRED' });
    await setSetting('fleet.vehicle_between_job_buffer_minutes', 0);
    await setSetting('fleet.driver_between_job_buffer_minutes', 0);
    await setSetting('finance.tax_lines', [{ code: 'VAT', label: 'VAT', rateBasisPoints: 1000 }]);
    const vehicle = await prisma.vehicle.create({
      data: { companyId, registrationNumber: `INV-${randomUUID().slice(0, 6).toUpperCase()}`, make: 'Test', model: 'Coaster', category: 'Integration fixture', seatCount: 12 },
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('creates a DRAFT from the approved completion snapshot and is idempotent', async () => {
    const requestId = await completedRequest({ depositReceivedPesewas: 2000, proposedChargesPesewas: 1500, approvedChargesPesewas: 1000 });
    const created = await createRentalInvoice(financeId, companyId, requestId);
    // quoted 9000 + approved 1000 = 10000 gross; VAT 10% = 1000; deposit 2000 -> total 9000.
    expect(created.duplicate).toBe(false);
    expect(created.invoice).toMatchObject({
      status: 'DRAFT', subtotalPesewas: 10000, taxPesewas: 1000,
      depositDeductionPesewas: 2000, totalPesewas: 9000, outstandingPesewas: 9000,
    });
    expect(created.invoice.reference).toMatch(/^RINV-[0-9A-F]{16}$/);
    expect(created.invoice.lines).toHaveLength(2);
    const again = await createRentalInvoice(financeId, companyId, requestId);
    expect(again.duplicate).toBe(true);
    expect(again.invoice.id).toBe(created.invoice.id);
    (globalThis as Record<string, unknown>).__invoiceId = created.invoice.id;
    (globalThis as Record<string, unknown>).__requestId = requestId;
  });

  it('requires a due date to issue, then settles to PAID through payments', async () => {
    const invoiceId = (globalThis as Record<string, unknown>).__invoiceId as string;
    await expect(transitionRentalInvoice(financeId, companyId, invoiceId, {
      toStatus: 'ISSUED', reason: 'Issuing without a due date',
    })).rejects.toMatchObject({ code: 'RENTAL_INVOICE_DUE_DATE_REQUIRED' });
    const issued = await transitionRentalInvoice(financeId, companyId, invoiceId, {
      toStatus: 'ISSUED', reason: 'Issuing to the customer', dueDate: '2027-03-01',
    });
    expect(issued).toMatchObject({ status: 'ISSUED', dueDate: '2027-03-01' });
    await expect(recordRentalInvoicePayment(financeId, companyId, invoiceId, {
      amountPesewas: 9001, receivedAt: '2027-02-15', reason: 'Overpaying the invoice',
    })).rejects.toBeInstanceOf(RentalInvoicePaymentExceedsError);
    const partial = await recordRentalInvoicePayment(financeId, companyId, invoiceId, {
      amountPesewas: 5000, method: 'Bank transfer', reference: 'TRX-1', receivedAt: '2027-02-15', reason: 'Part payment received',
    });
    expect(partial.outstandingPesewas).toBe(4000);
    const final = await recordRentalInvoicePayment(financeId, companyId, invoiceId, {
      amountPesewas: 4000, method: 'MoMo', reference: 'MOMO-2', receivedAt: '2027-02-20', reason: 'Balance received',
    });
    expect(final.invoice.status).toBe('PAID');
    const detail = await getRentalInvoice(financeId, companyId, invoiceId);
    expect(detail.payments).toHaveLength(2);
    expect(detail.history.map((row) => row.toStatus)).toEqual(['DRAFT', 'ISSUED', 'PAID']);
    await expect(prisma.rentalInvoicePayment.update({
      where: { id: detail.payments[0]?.id }, data: { amountPesewas: 1 },
    })).rejects.toBeDefined();
  });

  it('refuses voiding an invoice that has payments, and cannot invoice an unfinished rental', async () => {
    const requestId2 = await completedRequest({ depositReceivedPesewas: 0, proposedChargesPesewas: 0, approvedChargesPesewas: 0 });
    const created = await createRentalInvoice(financeId, companyId, requestId2);
    await transitionRentalInvoice(financeId, companyId, created.invoice.id, {
      toStatus: 'ISSUED', reason: 'Issuing second invoice', dueDate: '2027-03-05',
    });
    await recordRentalInvoicePayment(financeId, companyId, created.invoice.id, {
      amountPesewas: 100, receivedAt: '2027-02-16', reason: 'Small part payment',
    });
    await expect(transitionRentalInvoice(financeId, companyId, created.invoice.id, {
      toStatus: 'VOID', reason: 'Trying to void a paid-invoice',
    })).rejects.toMatchObject({ code: 'RENTAL_INVOICE_VOID_WITH_PAYMENTS' });
  });

  it('refuses invoicing when the deposit exceeds the billable amount', async () => {
    const requestId3 = await completedRequest({ depositReceivedPesewas: 50000, proposedChargesPesewas: 0, approvedChargesPesewas: 0 });
    await expect(createRentalInvoice(financeId, companyId, requestId3))
      .rejects.toMatchObject({ code: 'RENTAL_INVOICE_DEPOSIT_EXCEEDS_TOTAL' });
  });

  it('recognises rental revenue on the finance dashboard once issued (D-091)', async () => {
    // Standing rental position after the earlier tests: invoice one PAID
    // at 9000 (9000 paid); invoice two ISSUED at 9900 with 100 paid.
    const dashboard = await getFinanceDashboard({ actorId: financeId, companyId });
    expect(dashboard.streams.rental).toMatchObject({
      recognizedRevenuePesewas: 18900,
      paymentsReceivedPesewas: 9100,
      outstandingPesewas: 9800,
      reconciles: true,
    });
    expect(dashboard.streams.corporate.recognizedRevenuePesewas).toBe(0);
    expect(dashboard.recognizedRevenuePesewas).toBe(18900);
    expect(dashboard.reconciliation.reconciles).toBe(true);
  });
});
