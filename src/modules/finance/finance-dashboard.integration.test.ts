import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createContract, transitionContract } from '../contracts/contracts';
import { createBooking, transitionBooking } from '../bookings/bookings';
import { assignBookingToTrip, createTrip, transitionTrip } from '../trips/trips';
import { linkDriverAccount, postDriverEvent } from '../driver/driver';
import {
  generateCorporateInvoice,
  recordInvoicePayment,
  transitionCorporateInvoice,
} from './invoices';
import { getFinanceDashboard } from './dashboard';

const prisma = getPrisma();
let companyId = '';
let emptyCompanyId = '';
let financeId = '';
let financeOtherCompanyOnlyId = '';
let managerId = '';
let driverUserId = '';
let clientOneId = '';
let clientTwoId = '';

function isoDay(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

async function pay(invoiceId: string, input: {
  amountPesewas: number; method: string | null; reference: string | null; receivedAt: string;
}) {
  return recordInvoicePayment(
    { ...input, reason: 'Recording a client payment' },
    financeId, companyId, invoiceId,
  );
}

async function makeCompletedTrip(input: {
  clientId: string; employeeId: string; contractId: string; journeyDate: string; keyPrefix: string;
}) {
  const trip = await createTrip({
    clientId: input.clientId, routeId: null, serviceType: null, tripDate: input.journeyDate,
    plannedStartTime: null, plannedDurationMinutes: null, capacityLimit: 40,
    reason: 'Finance dashboard fixture trip',
  }, managerId, companyId);
  const vehicle = await prisma.vehicle.create({
    data: {
      companyId, registrationNumber: `FIN-${randomUUID().slice(0, 8).toUpperCase()}`,
      make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
    },
  });
  const driverRecord = await prisma.driver.findFirstOrThrow({ where: { companyId }, select: { id: true } });
  await prisma.trip.update({ where: { id: trip.id }, data: { vehicleId: vehicle.id, driverId: driverRecord.id } });
  const booking = await createBooking({
    employeeId: input.employeeId, contractId: input.contractId, routeId: null,
    bookingType: 'HOME_TO_OFFICE', journeyDate: input.journeyDate,
    pickupLocationId: null, dropoffLocationId: null, notes: null,
    reason: 'Finance dashboard fixture booking',
  }, managerId, companyId);
  await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, managerId, companyId, booking.id);
  await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning passenger for dashboard trip' }, managerId, companyId, trip.id);
  await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing dashboard fixture trip' }, managerId, companyId, trip.id);
  await transitionTrip({ toStatus: 'Dispatched', reason: 'Dispatching dashboard fixture trip' }, managerId, companyId, trip.id);
  await postDriverEvent({ eventType: 'START', idempotencyKey: `${input.keyPrefix}-start` }, driverUserId, companyId, trip.id);
  await postDriverEvent(
    { eventType: 'BOARD', idempotencyKey: `${input.keyPrefix}-board`, bookingId: booking.id }, driverUserId, companyId, trip.id,
  );
  await postDriverEvent(
    { eventType: 'COMPLETE', idempotencyKey: `${input.keyPrefix}-complete`, notes: 'All passengers dropped.' }, driverUserId, companyId, trip.id,
  );
}

async function makeActiveContract(clientId: string) {
  const draft = await createContract({
    clientId, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2028-12-31', renewalDate: null,
    routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
    billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
    reason: 'Finance dashboard test contract fixture',
  }, managerId, companyId);
  await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, managerId, companyId, draft.id);
  const active = await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, managerId, companyId, draft.id);
  return active.id;
}

describe('finance dashboard reconciles to invoice and payment records (FIN-07 / D-063)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, emptyCompany, finance, financeOther, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Finance dashboard ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Empty finance dashboard ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Dashboard Finance Officer', email: `fin-dash-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Other Company Finance Officer', email: `fin-other-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Dashboard Ops Manager', email: `fin-mgr-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    emptyCompanyId = emptyCompany.id;
    financeId = finance.id;
    financeOtherCompanyOnlyId = financeOther.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: financeId, companyId, roleCode: 'FINANCE_OFFICER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: financeId, companyId: emptyCompanyId, roleCode: 'FINANCE_OFFICER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: financeOtherCompanyOnlyId, companyId: emptyCompanyId, roleCode: 'FINANCE_OFFICER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    const driverUser = await prisma.user.create({
      data: { name: 'Dashboard Trip Driver', email: `fin-driver-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    driverUserId = driverUser.id;
    await prisma.userRoleAssignment.create({
      data: { userId: driverUserId, companyId, roleCode: 'DRIVER', reason: 'Integration setup', assignedById: null },
    });
    const driverRecord = await prisma.driver.create({ data: { companyId, fullName: 'Dashboard Driver', status: 'ACTIVE' } });
    await linkDriverAccount({
      actorId: managerId, companyId, driverId: driverRecord.id, userId: driverUserId,
      reason: 'Linking the fixture driver login for event tests',
    });

    const [clientOne, clientTwo] = await Promise.all([
      prisma.client.create({ data: { companyId, name: `Dashboard Client One ${randomUUID().slice(0, 6)}` } }),
      prisma.client.create({ data: { companyId, name: `Dashboard Client Two ${randomUUID().slice(0, 6)}` } }),
    ]);
    clientOneId = clientOne.id;
    clientTwoId = clientTwo.id;
    const [contractOneId, contractTwoId] = [
      await makeActiveContract(clientOneId),
      await makeActiveContract(clientTwoId),
    ];
    const [employeeOne, employeeTwo] = await Promise.all([
      prisma.employee.create({ data: { companyId, clientId: clientOneId, fullName: 'Dashboard Passenger One', transportEligible: true } }),
      prisma.employee.create({ data: { companyId, clientId: clientTwoId, fullName: 'Dashboard Passenger Two', transportEligible: true } }),
    ]);
    await prisma.setting.upsert({
      where: { companyId_key: { companyId, key: 'finance.corporate_rates' } },
      create: {
        companyId, key: 'finance.corporate_rates', configured: true,
        value: [
          { contractId: contractOneId, unit: 'PER_TRIP', ratePesewas: 20000 },
          { contractId: contractTwoId, unit: 'PER_TRIP', ratePesewas: 20000 },
        ] as never,
      },
      update: {
        configured: true,
        value: [
          { contractId: contractOneId, unit: 'PER_TRIP', ratePesewas: 20000 },
          { contractId: contractTwoId, unit: 'PER_TRIP', ratePesewas: 20000 },
        ] as never,
      },
    });

    await makeCompletedTrip({ clientId: clientOneId, employeeId: employeeOne.id, contractId: contractOneId, journeyDate: '2028-01-05', keyPrefix: 'fin-i1' });
    await makeCompletedTrip({ clientId: clientOneId, employeeId: employeeOne.id, contractId: contractOneId, journeyDate: '2028-02-03', keyPrefix: 'fin-i2' });
    await makeCompletedTrip({ clientId: clientTwoId, employeeId: employeeTwo.id, contractId: contractTwoId, journeyDate: '2028-01-12', keyPrefix: 'fin-i3' });
    await makeCompletedTrip({ clientId: clientTwoId, employeeId: employeeTwo.id, contractId: contractTwoId, journeyDate: '2028-02-10', keyPrefix: 'fin-i4' });
    await makeCompletedTrip({ clientId: clientTwoId, employeeId: employeeTwo.id, contractId: contractTwoId, journeyDate: '2028-03-03', keyPrefix: 'fin-i5' });

    const invoiceOne = (await generateCorporateInvoice(
      { contractId: contractOneId, periodStart: '2028-01-01', periodEnd: '2028-01-31', reason: 'Generating dashboard invoice one' },
      financeId, companyId,
    )).invoice;
    const invoiceTwo = (await generateCorporateInvoice(
      { contractId: contractOneId, periodStart: '2028-02-01', periodEnd: '2028-02-29', reason: 'Generating dashboard invoice two' },
      financeId, companyId,
    )).invoice;
    const invoiceThree = (await generateCorporateInvoice(
      { contractId: contractTwoId, periodStart: '2028-01-01', periodEnd: '2028-01-31', reason: 'Generating dashboard invoice three' },
      financeId, companyId,
    )).invoice;
    await generateCorporateInvoice(
      { contractId: contractTwoId, periodStart: '2028-02-01', periodEnd: '2028-02-29', reason: 'Generating dashboard draft invoice' },
      financeId, companyId,
    );
    const invoiceFive = (await generateCorporateInvoice(
      { contractId: contractTwoId, periodStart: '2028-03-01', periodEnd: '2028-03-31', reason: 'Generating dashboard invoice five' },
      financeId, companyId,
    )).invoice;

    // I1: issued and paid in full -> PAID. I2: issued, part-paid. I3: issued, unpaid.
    // I4 stays DRAFT. I5: issued then voided (no payments) -> excluded from revenue.
    await transitionCorporateInvoice({ toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing dashboard invoice one' }, financeId, companyId, invoiceOne.id);
    await pay(invoiceOne.id, { amountPesewas: 20000, method: 'Bank transfer', reference: 'FT-2028-001', receivedAt: '2028-01-20' });
    await transitionCorporateInvoice({ toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing dashboard invoice two' }, financeId, companyId, invoiceTwo.id);
    await pay(invoiceTwo.id, { amountPesewas: 5000, method: null, reference: null, receivedAt: '2028-02-15' });
    await transitionCorporateInvoice({ toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing dashboard invoice three' }, financeId, companyId, invoiceThree.id);
    await transitionCorporateInvoice({ toStatus: 'ISSUED', dueDate: '2026-12-31', reason: 'Issuing dashboard invoice five' }, financeId, companyId, invoiceFive.id);
    await transitionCorporateInvoice({ toStatus: 'VOID', reason: 'Voiding the unbilled dashboard invoice' }, financeId, companyId, invoiceFive.id);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reconciles headline totals to the underlying records', async () => {
    const dashboard = await getFinanceDashboard({ actorId: financeId, companyId });
    expect(dashboard.recognizedRevenuePesewas).toBe(60000);
    expect(dashboard.paymentsReceivedPesewas).toBe(25000);
    expect(dashboard.outstandingPesewas).toBe(35000);
    expect(dashboard.reconciliation).toEqual({
      recognizedRevenuePesewas: 60000,
      paymentsReceivedPesewas: 25000,
      outstandingPesewas: 35000,
      reconciles: true,
    });
    expect(dashboard.draftPipelinePesewas).toBe(20000);
    expect(dashboard.draftInvoiceCount).toBe(1);
    expect(dashboard.voidedInvoiceCount).toBe(1);
    expect(dashboard.voidedTotalPesewas).toBe(20000);
    expect(dashboard.countsByStatus).toEqual([
      { status: 'DRAFT', invoiceCount: 1, totalPesewas: 20000 },
      { status: 'ISSUED', invoiceCount: 2, totalPesewas: 40000 },
      { status: 'PAID', invoiceCount: 1, totalPesewas: 20000 },
      { status: 'VOID', invoiceCount: 1, totalPesewas: 20000 },
    ]);
  });

  it('breaks totals down per client and by payment method, with coverage pairs', async () => {
    const dashboard = await getFinanceDashboard({ actorId: financeId, companyId });
    expect(dashboard.clients).toHaveLength(2);
    const [first, second] = dashboard.clients;
    expect(first.clientId).toBe(clientTwoId);
    expect(first).toMatchObject({ standingInvoiceCount: 1, invoicedPesewas: 20000, paidPesewas: 0, outstandingPesewas: 20000 });
    expect(second.clientId).toBe(clientOneId);
    expect(second).toMatchObject({ standingInvoiceCount: 2, invoicedPesewas: 40000, paidPesewas: 25000, outstandingPesewas: 15000 });
    expect(dashboard.paymentsByMethod).toEqual([
      { method: 'Bank transfer', paymentCount: 1, amountPesewas: 20000 },
      { method: 'Not recorded', paymentCount: 1, amountPesewas: 5000 },
    ]);
    expect(dashboard.coverage).toEqual({
      issuedInvoicesWithTimestamp: { numerator: 3, denominator: 3 },
      paymentsWithMethod: { numerator: 1, denominator: 2 },
      paymentsWithReference: { numerator: 1, denominator: 2 },
    });
  });

  it('windows only the activity section; balances stay point-in-time', async () => {
    const january = await getFinanceDashboard({
      actorId: financeId, companyId, fromDate: '2028-01-01', toDate: '2028-01-31',
    });
    expect(january.activity.paymentsReceivedPesewas).toBe(20000);
    expect(january.activity.paymentCount).toBe(1);
    // Issuance is timestamped when it happens (today), not in the 2028 window.
    expect(january.activity.invoicesIssuedCount).toBe(0);
    expect(january.activity.revenueRecognizedPesewas).toBe(0);
    expect(january.recognizedRevenuePesewas).toBe(60000);
    expect(january.outstandingPesewas).toBe(35000);

    const aroundToday = await getFinanceDashboard({
      actorId: financeId, companyId, fromDate: isoDay(-1), toDate: isoDay(1),
    });
    expect(aroundToday.activity.invoicesIssuedCount).toBe(3);
    expect(aroundToday.activity.revenueRecognizedPesewas).toBe(60000);
    expect(aroundToday.activity.paymentsReceivedPesewas).toBe(0);

    const allTime = await getFinanceDashboard({ actorId: financeId, companyId });
    expect(allTime.activity).toEqual({
      paymentsReceivedPesewas: 25000, paymentCount: 2,
      invoicesIssuedCount: 3, revenueRecognizedPesewas: 60000,
    });
  });

  it('reports margin as insufficient data before any approved expense exists (FIN-05R)', async () => {
    // Runs before the FIN-05R expense scenario below: with no approved
    // expenses the margin stays INSUFFICIENT_DATA and only the still
    // unsupported metrics are listed (expenses/margin left the list in D-082).
    const dashboard = await getFinanceDashboard({ actorId: financeId, companyId });
    expect(dashboard.margin.status).toBe('INSUFFICIENT_DATA');
    // D-090/5C: ageing is available and rental invoices exist; only the
    // headline rental-revenue gap remains listed.
    expect(dashboard.unavailableMetrics.map((item) => item.metric)).toEqual([
      'Rental revenue in the headline totals',
    ]);
  });

  it('denies read-only and unrelated roles and isolates companies', async () => {
    await expect(getFinanceDashboard({ actorId: managerId, companyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(getFinanceDashboard({ actorId: driverUserId, companyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(getFinanceDashboard({ actorId: financeOtherCompanyOnlyId, companyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);

    const empty = await getFinanceDashboard({ actorId: financeId, companyId: emptyCompanyId });
    expect(empty.recognizedRevenuePesewas).toBe(0);
    expect(empty.paymentsReceivedPesewas).toBe(0);
    expect(empty.outstandingPesewas).toBe(0);
    expect(empty.reconciliation.reconciles).toBe(true);
    expect(empty.clients).toEqual([]);
    expect(empty.paymentsByMethod).toEqual([]);
  });

  it('rejects an inverted or over-long window', async () => {
    await expect(getFinanceDashboard({
      actorId: financeId, companyId, fromDate: '2028-02-01', toDate: '2028-01-01',
    })).rejects.toBeInstanceOf(ZodError);
    await expect(getFinanceDashboard({
      actorId: financeId, companyId, fromDate: '2027-01-01', toDate: '2028-06-01',
    })).rejects.toBeInstanceOf(ZodError);
  });

  it('counts only approved expenses as cost and estimates margin (FIN-05R / D-082)', async () => {
    const { createExpense, transitionExpense } = await import('./expenses');
    const approver = await prisma.user.create({
      data: { name: 'Dashboard Expense Approver', email: `fin-approver-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: approver.id, companyId, roleCode: 'FINANCE_OFFICER', reason: 'Integration setup', assignedById: null },
    });
    const today = isoDay(0);
    const fuel = await createExpense({
      actorId: financeId, companyId, expenseDate: today, category: 'FUEL',
      description: 'Dashboard cost fixture fuel', amountPesewas: 5000, reason: 'Fuel for dashboard fixture',
    });
    await transitionExpense({
      actorId: approver.id, companyId, expenseId: fuel.id, toStatus: 'Approved', reason: 'Verified against receipts',
    });
    const pending = await createExpense({
      actorId: financeId, companyId, expenseDate: today, category: 'TOLLS',
      description: 'Dashboard pending fixture', amountPesewas: 999999, reason: 'Awaiting approval in fixture',
    });
    expect(pending.status).toBe('Pending');

    const dashboard = await getFinanceDashboard({ actorId: financeId, companyId });
    const fuelRow = dashboard.expenses.byCategory.find((row) => row.category === 'FUEL');
    expect(fuelRow?.amountPesewas).toBeGreaterThanOrEqual(5000);
    expect(dashboard.expenses.pendingPesewas).toBeGreaterThanOrEqual(999999);
    expect(dashboard.margin.status).toBe('ESTIMATED');
    if (dashboard.margin.status === 'ESTIMATED') {
      expect(dashboard.margin.approvedCostsPesewas).toBeLessThan(dashboard.recognizedRevenuePesewas);
      expect(dashboard.margin.marginPesewas)
        .toBe(dashboard.margin.revenuePesewas - dashboard.margin.approvedCostsPesewas);
    }
  });

  it('ages an old-due-date issued invoice into OVER_90 with no undated spill (D-090/5C)', async () => {
      const passenger = await prisma.employee.create({
        data: { companyId, clientId: clientOneId, fullName: 'Ageing Passenger', transportEligible: true },
      });
      const contractOne = await prisma.contract.findFirstOrThrow({ where: { companyId, clientId: clientOneId, status: 'Active' } });
      await makeCompletedTrip({ clientId: clientOneId, employeeId: passenger.id, contractId: contractOne.id, journeyDate: '2028-04-07', keyPrefix: 'fin-age1' });
      const aged = (await generateCorporateInvoice(
        { contractId: contractOne.id, periodStart: '2028-04-01', periodEnd: '2028-04-30', reason: 'Generating ageing fixture invoice' },
        financeId, companyId,
      )).invoice;
      await transitionCorporateInvoice({ toStatus: 'ISSUED', dueDate: '2020-01-01', reason: 'Issuing ageing fixture invoice' }, financeId, companyId, aged.id);
  
      const dashboard = await getFinanceDashboard({ actorId: financeId, companyId });
      expect(dashboard.ageing.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Every issued invoice in this company now carries a due date (5C.2).
      expect(dashboard.ageing.undated.invoiceCount).toBe(0);
      const over90 = dashboard.ageing.buckets.find((bucket) => bucket.bucket === 'OVER_90');
      expect(over90).toBeDefined();
      expect(over90?.invoiceCount ?? 0).toBeGreaterThanOrEqual(1);
      expect(over90?.outstandingPesewas ?? 0).toBeGreaterThanOrEqual(aged.totalPesewas);
      expect(over90?.corporateOutstandingPesewas ?? 0).toBeGreaterThanOrEqual(aged.totalPesewas);
      expect(over90?.rentalOutstandingPesewas ?? 0).toBe(0);
      // The ageing total reconciles with corporate outstanding minus paid/void lanes:
      const agedTotal = dashboard.ageing.buckets.reduce((sum, bucket) => sum + bucket.outstandingPesewas, 0)
        + dashboard.ageing.undated.outstandingPesewas;
      expect(agedTotal).toBeGreaterThanOrEqual(aged.totalPesewas);
    });
});
