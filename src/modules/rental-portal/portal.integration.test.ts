import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  RentalRequestMissingSubmissionFieldsError,
  RentalRequestNotDraftError,
  transitionRentalRequest,
} from '../rentals/rental-requests';
import {
  createOwnRentalRequest,
  getRentalPortalHome,
  linkCustomerAccount,
  RentalPortalNotLinkedError,
  RentalPortalPolicyError,
  RentalPortalRequestNotFoundError,
  RentalPortalValidationError,
  submitOwnRentalPortalRequest,
  unlinkCustomerAccount,
  updateOwnRentalRequest,
  withdrawOwnRentalRequest,
} from './portal';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let opsId = '';
let customerUserId = '';
let customerTwoUserId = '';
let unlinkedUserId = '';
let customerId = '';
let customerTwoId = '';

async function makeUser(name: string) {
  return prisma.user.create({
    data: { name, email: `rnt-portal-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

async function assignRole(userId: string, roleCode: string, targetCompanyId = companyId) {
  await prisma.userRoleAssignment.create({
    data: { userId, companyId: targetCompanyId, roleCode, reason: 'Integration setup', assignedById: null },
  });
}

const completeFields = {
  serviceDate: '2028-04-10',
  departureTime: '09:30',
  returnTime: '17:30',
  durationMinutes: null,
  pickupLocation: 'Accra Mall',
  destination: 'Cape Coast',
  intermediateStops: null,
  passengerCount: 20,
  luggageSpecialNeeds: null,
  purpose: 'Company retreat',
  requestedVehicleType: 'Coach',
  driverRequirement: null,
  tripContactName: null,
  tripContactTelephone: null,
  tripContactEmail: null,
  notes: null,
};

describe('rental customer portal with linked customer identity (RNT-09 / D-066)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, ops, customerUser, customerTwoUser, unlinked] = await Promise.all([
      prisma.company.create({ data: { name: `Rental portal ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other rental portal ${randomUUID()}` } }),
      makeUser('Rental Ops Manager'),
      makeUser('Rental Customer One'),
      makeUser('Rental Customer Two'),
      makeUser('Rental Unlinked Customer'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    opsId = ops.id;
    customerUserId = customerUser.id;
    customerTwoUserId = customerTwoUser.id;
    unlinkedUserId = unlinked.id;
    await assignRole(opsId, 'OPS_MANAGER');
    await assignRole(customerUserId, 'RENTAL_CUSTOMER');
    await assignRole(customerTwoUserId, 'RENTAL_CUSTOMER');
    await assignRole(unlinkedUserId, 'RENTAL_CUSTOMER');

    const [customer, customerTwo] = await Promise.all([
      prisma.customer.create({
        data: { companyId, displayName: 'Portal Weddings Ltd', contactPerson: 'Efua Mensah', notes: 'Internal only note' },
      }),
      prisma.customer.create({ data: { companyId, displayName: 'Portal Tours Ltd' } }),
    ]);
    customerId = customer.id;
    customerTwoId = customerTwo.id;
    await linkCustomerAccount({
      actorId: opsId, companyId, customerId, userId: customerUserId, reason: 'Linking the first portal customer',
    });
    await linkCustomerAccount({
      actorId: opsId, companyId, customerId: customerTwoId, userId: customerTwoUserId, reason: 'Linking the second portal customer',
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enforces the audited link rules', async () => {
    await expect(linkCustomerAccount({
      actorId: opsId, companyId, customerId, userId: customerUserId, reason: 'Trying to link twice',
    })).rejects.toBeInstanceOf(RentalPortalValidationError);
    // The ops manager holds no Rental Customer assignment.
    await expect(linkCustomerAccount({
      actorId: opsId, companyId,
      customerId: (await prisma.customer.create({ data: { companyId, displayName: 'Spare Customer' } })).id,
      userId: opsId, reason: 'Linking a non-customer login',
    })).rejects.toBeInstanceOf(RentalPortalValidationError);
    await expect(linkCustomerAccount({
      actorId: customerUserId, companyId, customerId: customerTwoId, userId: unlinkedUserId,
      reason: 'Customer trying to self-link',
    })).rejects.toBeInstanceOf(PermissionDeniedError);
    await unlinkCustomerAccount({ actorId: opsId, companyId, customerId: customerTwoId, reason: 'Testing the unlink path' });
    await expect(getRentalPortalHome({ actorId: customerTwoUserId, companyId }))
      .rejects.toBeInstanceOf(RentalPortalNotLinkedError);
    await linkCustomerAccount({
      actorId: opsId, companyId, customerId: customerTwoId, userId: customerTwoUserId, reason: 'Re-linking after unlink test',
    });
    const home = await getRentalPortalHome({ actorId: customerTwoUserId, companyId });
    expect(home.profile.displayName).toBe('Portal Tours Ltd');
  });

  it('denies unlinked logins and other companies', async () => {
    await expect(getRentalPortalHome({ actorId: unlinkedUserId, companyId }))
      .rejects.toBeInstanceOf(RentalPortalNotLinkedError);
    await expect(getRentalPortalHome({ actorId: customerUserId, companyId: otherCompanyId }))
      .rejects.toBeInstanceOf(RentalPortalNotLinkedError);
  });

  it('runs the own-request lifecycle under the shared submission rules', async () => {
    const draft = await createOwnRentalRequest(
      { ...completeFields, serviceDate: null, departureTime: null, pickupLocation: null, reason: 'Starting a rough enquiry' },
      customerUserId, companyId,
    );
    expect(draft.status).toBe('Draft');
    expect(draft.customerId).toBe(customerId);
    expect(draft.requestSource).toBe('APP');

    await expect(submitOwnRentalPortalRequest(
      { reason: 'Submitting an incomplete draft' }, customerUserId, companyId, draft.id,
    )).rejects.toBeInstanceOf(RentalRequestMissingSubmissionFieldsError);

    const updated = await updateOwnRentalRequest(
      { ...completeFields, reason: 'Completing the enquiry details' }, customerUserId, companyId, draft.id,
    );
    expect(updated.serviceDate).toBe('2028-04-10');

    const submitted = await submitOwnRentalPortalRequest(
      { reason: 'Ready for the operations team' }, customerUserId, companyId, draft.id,
    );
    expect(submitted.status).toBe('Submitted');

    const withdrawn = await withdrawOwnRentalRequest(
      { reason: 'Our plans changed, cancelling' }, customerUserId, companyId, draft.id,
    );
    expect(withdrawn.status).toBe('Cancelled');

    const home = await getRentalPortalHome({ actorId: customerUserId, companyId });
    expect(home.profile.displayName).toBe('Portal Weddings Ltd');
    expect(home.quotations.state).toBe('NONE_ISSUED');
    expect(home.payments.state).toBe('NONE_DUE');
    const cancelled = home.requests.find((row) => row.requestId === draft.id);
    expect(cancelled?.status).toBe('Cancelled');
    expect(cancelled?.canWithdraw).toBe(false);
  });

  it('protects submitted requests once operations start review, and isolates customers', async () => {
    const own = await createOwnRentalRequest(
      { ...completeFields, reason: 'Enquiry that will be reviewed' }, customerUserId, companyId,
    );
    await submitOwnRentalPortalRequest({ reason: 'Please review this one' }, customerUserId, companyId, own.id);
    await transitionRentalRequest(
      { toStatus: 'Under Review', reason: 'Operations picked this up' }, opsId, companyId, own.id,
    );
    await expect(withdrawOwnRentalRequest(
      { reason: 'Trying to withdraw late' }, customerUserId, companyId, own.id,
    )).rejects.toBeInstanceOf(RentalPortalPolicyError);
    await expect(updateOwnRentalRequest(
      { ...completeFields, reason: 'Trying to edit late' }, customerUserId, companyId, own.id,
    )).rejects.toBeInstanceOf(RentalRequestNotDraftError);

    // The other customer cannot touch it at all.
    await expect(withdrawOwnRentalRequest(
      { reason: 'Withdrawing someone else' }, customerTwoUserId, companyId, own.id,
    )).rejects.toBeInstanceOf(RentalPortalRequestNotFoundError);
    await expect(updateOwnRentalRequest(
      { ...completeFields, reason: 'Editing someone else' }, customerTwoUserId, companyId, own.id,
    )).rejects.toBeInstanceOf(RentalPortalRequestNotFoundError);
    await expect(submitOwnRentalPortalRequest(
      { reason: 'Submitting someone else' }, customerTwoUserId, companyId, own.id,
    )).rejects.toBeInstanceOf(RentalPortalRequestNotFoundError);

    const otherHome = await getRentalPortalHome({ actorId: customerTwoUserId, companyId });
    expect(otherHome.requests.map((row) => row.requestId)).not.toContain(own.id);
  });
});
