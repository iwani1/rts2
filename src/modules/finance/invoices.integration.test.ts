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
  InvoiceValidationError,
  generateCorporateInvoice,
  getCorporateInvoice,
  listCorporateInvoices,
} from './invoices';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let financeId = '';
let clientId = '';
let contractId = '';
let secondContractId = '';
let employee1Id = '';
const PERIOD = { periodStart: '2027-09-01', periodEnd: '2027-09-30' };

async function setRates(rates: unknown) {
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: 'finance.corporate_rates' } },
    create: { companyId, key: 'finance.corporate_rates', value: rates as never, configured: true },
    update: { value: rates as never, configured: true },
  });
}

describe('corporate invoices with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, finance] = await Promise.all([
      prisma.company.create({ data: { name: `Invoices ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other invoices ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Finance Officer', email: `fin-${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    financeId = finance.id;
    await prisma.userRoleAssignment.create({
      data: { userId: financeId, companyId, roleCode: 'FINANCE_OFFICER', reason: 'Integration setup', assignedById: null },
    });
    const client = await prisma.client.create({ data: { companyId, name: `Invoice Client ${randomUUID()}` } });
    clientId = client.id;
    // Contracts are created by an operations manager (Finance Officer holds
    // client:manage only in a billing context).
    const manager = await prisma.user.create({
      data: { name: 'Invoice Ops Manager', email: `inv-mgr-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
        await prisma.userRoleAssignment.create({
      data: { userId: manager.id, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    const makeActiveContractAsManager = async () => {
      const draft = await createContract({
        clientId, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31', renewalDate: null,
        routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
        billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
        reason: 'Integration test contract fixture',
      }, manager.id, companyId);
      await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, manager.id, companyId, draft.id);
      const active = await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, manager.id, companyId, draft.id);
      return active.id;
    };
    contractId = await makeActiveContractAsManager();
    secondContractId = await makeActiveContractAsManager();
    const employee1 = await prisma.employee.create({
      data: { companyId, clientId, fullName: 'Invoiced Passenger', transportEligible: true },
    });
    employee1Id = employee1.id;
    // A Completed trip on 2027-09-06 (Monday) with one Completed booking.
    const trip = await createTrip({
      clientId, routeId: null, serviceType: null, tripDate: '2027-09-06', plannedStartTime: null,
      plannedDurationMinutes: null, capacityLimit: 40, reason: 'Invoice fixture trip',
    }, manager.id, companyId);
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `INV-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Testbus', model: 'Coach', category: 'BUS', seatCount: 40,
      },
    });
    const driver = await prisma.driver.create({ data: { companyId, fullName: 'Invoice Driver', status: 'ACTIVE' } });
    await prisma.trip.update({ where: { id: trip.id }, data: { vehicleId: vehicle.id, driverId: driver.id } });
    const booking = await createBooking({
      employeeId: employee1Id, contractId, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2027-09-06',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Invoice fixture booking',
    }, manager.id, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Confirming fixture booking seat' }, manager.id, companyId, booking.id);
    await assignBookingToTrip({ bookingId: booking.id, reason: 'Assigning passenger for invoice trip' }, manager.id, companyId, trip.id);
    // Walk the trip and complete the passenger through the guarded state
    // machine using a real linked driver account and driver events.
    const driverUser = await prisma.user.create({
      data: { name: 'Invoice Trip Driver', email: `inv-driver-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: driverUser.id, companyId, roleCode: 'DRIVER', reason: 'Integration setup', assignedById: null },
    });
    await linkDriverAccount({
      actorId: manager.id, companyId, driverId: driver.id, userId: driverUser.id,
      reason: 'Linking the fixture driver login for event tests',
    });
    await transitionTrip({ toStatus: 'Ready for Dispatch', reason: 'Preparing invoice fixture trip' }, manager.id, companyId, trip.id);
    await transitionTrip({ toStatus: 'Dispatched', reason: 'Dispatching invoice fixture trip' }, manager.id, companyId, trip.id);
    await postDriverEvent({ eventType: 'START', idempotencyKey: 'inv-start-0001' }, driverUser.id, companyId, trip.id);
    await postDriverEvent(
      { eventType: 'BOARD', idempotencyKey: 'inv-board-0001', bookingId: booking.id }, driverUser.id, companyId, trip.id,
    );
    await postDriverEvent(
      { eventType: 'COMPLETE', idempotencyKey: 'inv-complete-01', notes: 'All passengers dropped.' },
      driverUser.id, companyId, trip.id,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('refuses to price an invoice without a configured corporate rate', async () => {
    await expect(generateCorporateInvoice(
      { contractId, ...PERIOD, reason: 'Trying without a configured rate' }, financeId, companyId,
    )).rejects.toBeInstanceOf(InvoicePolicyError);
  });

  it('generates a per-passenger DRAFT invoice and is idempotent for the same contract and period', async () => {
    await setRates([{ contractId, unit: 'PER_PASSENGER', ratePesewas: 15000 }]);
    const first = await generateCorporateInvoice(
      { contractId, ...PERIOD, reason: 'Raising the September corporate invoice' }, financeId, companyId,
    );
    expect(first.duplicate).toBe(false);
    expect(first.invoice.status).toBe('DRAFT');
    expect(first.invoice.subtotalPesewas).toBe(15000);
    expect(first.invoice.taxPesewas).toBe(0);
    expect(first.invoice.totalPesewas).toBe(15000);
    expect(first.invoice.lines).toHaveLength(1);
    expect(first.invoice.lines[0].quantity).toBe(1);
    expect(first.invoice.lines[0].amountPesewas).toBe(15000);
    const again = await generateCorporateInvoice(
      { contractId, ...PERIOD, reason: 'Accidental duplicate generation attempt' }, financeId, companyId,
    );
    expect(again.duplicate).toBe(true);
    expect(again.invoice.id).toBe(first.invoice.id);
    const listed = await listCorporateInvoices({ actorId: financeId, companyId, clientId });
    expect(listed.invoices.filter((invoice) => invoice.contractId === contractId)).toHaveLength(1);
    const fetched = await getCorporateInvoice({ actorId: financeId, companyId, invoiceId: first.invoice.id });
    expect(fetched.invoice.reference).toBe(first.invoice.reference);
  });

  it('refuses a contract with no billable trips in the period', async () => {
    await setRates([
      { contractId, unit: 'PER_PASSENGER', ratePesewas: 15000 },
      { contractId: secondContractId, unit: 'PER_TRIP', ratePesewas: 900000 },
    ]);
    await expect(generateCorporateInvoice(
      { contractId: secondContractId, ...PERIOD, reason: 'Second contract has no trips yet' }, financeId, companyId,
    )).rejects.toBeInstanceOf(InvoiceValidationError);
  });

  it('denies invoice access across companies', async () => {
    await expect(listCorporateInvoices({ actorId: financeId, companyId: otherCompanyId })).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
