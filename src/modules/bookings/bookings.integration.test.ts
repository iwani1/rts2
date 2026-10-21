import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createContract, transitionContract } from '../contracts/contracts';
import {
  BookingDuplicateError,
  BookingPolicyError,
  BookingTransitionNotAllowedError,
  BookingValidationError,
  createBooking,
  getBooking,
  listBookings,
  transitionBooking,
} from './bookings';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let managerId = '';
let clientId = '';
let eligibleEmployeeId = '';
let ineligibleEmployeeId = '';
let unrecordedEmployeeId = '';
let activeContractId = '';
let suspendedContractId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

const FUTURE = '2027-06-01';
const bookingInput = (overrides: Record<string, unknown> = {}) => ({
  employeeId: eligibleEmployeeId,
  contractId: null,
  routeId: null,
  bookingType: 'HOME_TO_OFFICE',
  journeyDate: FUTURE,
  pickupLocationId: null,
  dropoffLocationId: null,
  notes: null,
  reason: 'Integration test booking entry',
  ...overrides,
});

describe('bookings with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Bookings ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other bookings ${randomUUID()}` } }),
      makeUser('Booking Ops Manager'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    const client = await prisma.client.create({ data: { companyId, name: `Booking Client ${randomUUID()}` } });
    clientId = client.id;
    const [eligible, ineligible, unrecorded] = await Promise.all([
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Eligible Person', transportEligible: true } }),
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Ineligible Person', transportEligible: false } }),
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Unrecorded Person', transportEligible: null } }),
    ]);
    eligibleEmployeeId = eligible.id;
    ineligibleEmployeeId = ineligible.id;
    unrecordedEmployeeId = unrecorded.id;
    const contractFields = {
      clientId, serviceType: 'Staff busing', startDate: '2026-01-01', endDate: '2027-12-31', renewalDate: null,
      routesAndStops: null, serviceDaysAndShifts: null, vehicleRequirements: null, pricingModel: null,
      billingFrequency: null, paymentTerms: null, serviceLevelTargets: null, notes: null,
      reason: 'Integration test contract fixture',
    };
    const makeActiveContract = async (suspend: boolean) => {
      const draft = await createContract(contractFields, managerId, companyId);
      await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting fixture for approval' }, managerId, companyId, draft.id);
      const active = await transitionContract({ toStatus: 'Active', reason: 'Fixture contract approved' }, managerId, companyId, draft.id);
      if (suspend) {
        await transitionContract({ toStatus: 'Suspended', reason: 'Fixture contract suspended' }, managerId, companyId, draft.id);
      }
      return active.id;
    };
    activeContractId = await makeActiveContract(false);
    suspendedContractId = await makeActiveContract(true);
  });

  afterAll(async () => {
    // Integration tests run against a disposable *_test database; recreate it when a clean slate is needed.
    await prisma.$disconnect();
  });

  it('creates a Pending booking for an eligible employee and walks accept/cancel', async () => {
    const booking = await createBooking(bookingInput({ contractId: activeContractId }), managerId, companyId);
    expect(booking.reference).toMatch(/^BKG-[A-F0-9]{16}$/);
    expect(booking.status).toBe('Pending');
    const accepted = await transitionBooking({ toStatus: 'Accepted', reason: 'Seat confirmed by operations' }, managerId, companyId, booking.id);
    expect(accepted.status).toBe('Accepted');
    const cancelled = await transitionBooking({ toStatus: 'Cancelled', reason: 'Employee on leave that day' }, managerId, companyId, booking.id);
    expect(cancelled.status).toBe('Cancelled');
    const detail = await getBooking({ actorId: managerId, companyId, bookingId: booking.id });
    expect(detail.history.map((entry) => entry.toStatus)).toEqual(['Cancelled', 'Accepted', 'Pending']);
    await expect(transitionBooking({ toStatus: 'Accepted', reason: 'Reviving a cancelled booking' }, managerId, companyId, booking.id))
      .rejects.toBeInstanceOf(BookingTransitionNotAllowedError);
  });

  it('rejects bookings for ineligible, unrecorded-eligibility, past-date and wrong-contract cases', async () => {
    await expect(createBooking(bookingInput({ employeeId: ineligibleEmployeeId }), managerId, companyId))
      .rejects.toBeInstanceOf(BookingValidationError);
    await expect(createBooking(bookingInput({ employeeId: unrecordedEmployeeId }), managerId, companyId))
      .rejects.toBeInstanceOf(BookingValidationError);
    await expect(createBooking(bookingInput({ journeyDate: '2020-01-01' }), managerId, companyId))
      .rejects.toBeInstanceOf(BookingValidationError);
    await expect(createBooking(bookingInput({ contractId: suspendedContractId }), managerId, companyId))
      .rejects.toBeInstanceOf(BookingPolicyError);
  });

  it('allows a suspended-contract booking only when the configured policy allows it', async () => {
    await prisma.setting.create({
      data: { companyId, key: 'contracts.inactive_booking_policy', value: 'ALLOW', configured: true, updatedById: managerId },
    });
    const booking = await createBooking(bookingInput({ contractId: suspendedContractId, journeyDate: '2027-06-02' }), managerId, companyId);
    expect(booking.status).toBe('Pending');
    await prisma.setting.update({
      where: { companyId_key: { companyId, key: 'contracts.inactive_booking_policy' } },
      data: { value: 'BLOCK' },
    });
    await expect(createBooking(bookingInput({ contractId: suspendedContractId, journeyDate: '2027-06-03' }), managerId, companyId))
      .rejects.toBeInstanceOf(BookingPolicyError);
  });

  it('prevents duplicate live journeys, including under parallel requests', async () => {
    await createBooking(bookingInput({ journeyDate: '2027-06-04' }), managerId, companyId);
    await expect(createBooking(bookingInput({ journeyDate: '2027-06-04' }), managerId, companyId))
      .rejects.toBeInstanceOf(BookingDuplicateError);
    const results = await Promise.allSettled([
      createBooking(bookingInput({ journeyDate: '2027-06-05' }), managerId, companyId),
      createBooking(bookingInput({ journeyDate: '2027-06-05' }), managerId, companyId),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    // A cancelled journey can be booked again.
    const list = await listBookings({ actorId: managerId, companyId, journeyDate: '2027-06-04', status: 'Pending' });
    await transitionBooking({ toStatus: 'Cancelled', reason: 'Employee plans changed' }, managerId, companyId, list.bookings[0].id);
    const rebooked = await createBooking(bookingInput({ journeyDate: '2027-06-04' }), managerId, companyId);
    expect(rebooked.status).toBe('Pending');
  });

  it('refuses manual assignment transitions and denies cross-company access', async () => {
    const booking = await createBooking(bookingInput({ journeyDate: '2027-06-06' }), managerId, companyId);
    await transitionBooking({ toStatus: 'Accepted', reason: 'Seat confirmed by operations' }, managerId, companyId, booking.id);
    await expect(transitionBooking({ toStatus: 'Assigned', reason: 'Typing the status by hand' }, managerId, companyId, booking.id))
      .rejects.toBeInstanceOf(BookingPolicyError);
    await expect(getBooking({ actorId: managerId, companyId: otherCompanyId, bookingId: booking.id }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(listBookings({ actorId: managerId, companyId: otherCompanyId }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
  });
});
