import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { assignRole, PermissionDeniedError } from '@/modules/auth/permissions';
import {
  createRentalRequest, getRentalRequest, listRentalRequests, RentalCustomerNotFoundError,
  RentalRequestMissingSubmissionFieldsError, RentalRequestNotDraftError, RentalRequestNotFoundError,
  submitRentalRequest, updateRentalRequestDraft,
} from './rental-requests';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let adminId = '';
let managerId = '';
let otherManagerId = '';
let dispatcherId = '';
let customerId = '';
let otherCustomerId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

const draftInput = (customer: string, overrides: Record<string, unknown> = {}) => ({
  customerId: customer,
  serviceDate: null,
  departureTime: null,
  returnTime: null,
  durationMinutes: null,
  pickupLocation: null,
  destination: null,
  intermediateStops: null,
  passengerCount: null,
  luggageSpecialNeeds: null,
  purpose: null,
  requestedVehicleType: null,
  driverRequirement: null,
  tripContactName: null,
  tripContactTelephone: null,
  tripContactEmail: null,
  notes: null,
  requestSource: null,
  reason: 'Capture enquiry for later completion',
  ...overrides,
});

describe('staff rental request Draft persistence with PostgreSQL', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, admin, manager, otherManager, dispatcher] = await Promise.all([
      prisma.company.create({ data: { name: `Rental request tests ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other rental tests ${randomUUID()}` } }),
      makeUser('Rental test admin'), makeUser('Rental test manager'), makeUser('Other rental manager'), makeUser('Rental test dispatcher'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    adminId = admin.id;
    managerId = manager.id;
    otherManagerId = otherManager.id;
    dispatcherId = dispatcher.id;
    const [customer, otherCustomer] = await Promise.all([
      prisma.customer.create({ data: { companyId, displayName: 'Rental Test Customer' } }),
      prisma.customer.create({ data: { companyId: otherCompanyId, displayName: 'Other Tenant Customer' } }),
    ]);
    customerId = customer.id;
    otherCustomerId = otherCustomer.id;
    await prisma.userRoleAssignment.create({
      data: { userId: adminId, roleCode: 'SUPER_ADMIN', assignedById: adminId, reason: 'Rental request integration test admin' },
    });
    await assignRole({ actorId: adminId, targetUserId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Rental request integration test manager' });
    await assignRole({ actorId: adminId, targetUserId: otherManagerId, companyId: otherCompanyId, roleCode: 'OPS_MANAGER', reason: 'Other tenant integration test manager' });
    await assignRole({ actorId: adminId, targetUserId: dispatcherId, companyId, roleCode: 'DISPATCHER', reason: 'Rental enquiry permission boundary test' });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('creates an incomplete Draft and records its initial status history atomically', async () => {
    const draft = await createRentalRequest(draftInput(customerId), managerId, companyId);
    expect(draft.status).toBe('Draft');
    expect(draft.customerName).toBe('Rental Test Customer');
    expect(draft.serviceDate).toBeNull();
    const detail = await getRentalRequest({ actorId: managerId, companyId, requestId: draft.id });
    expect(detail.history).toHaveLength(1);
    expect(detail.history[0]).toMatchObject({ fromStatus: null, toStatus: 'Draft', reason: 'Capture enquiry for later completion' });
    const audit = await prisma.auditEvent.findFirst({ where: { entityType: 'RENTAL_REQUEST', entityId: draft.id, action: 'RENTAL_REQUEST_DRAFT_CREATED' } });
    expect(audit?.summary).toEqual({ reason: 'Capture enquiry for later completion' });
    await expect(prisma.rentalRequestStatusHistory.updateMany({ where: { requestId: draft.id }, data: { reason: 'Tampered history entry' } })).rejects.toBeDefined();
    await expect(prisma.rentalRequest.update({ where: { id: draft.id }, data: { status: 'Submitted' } })).rejects.toBeDefined();
    await expect(prisma.rentalRequestStatusHistory.create({ data: {
      companyId, requestId: draft.id, actorId: managerId, fromStatus: 'Draft', toStatus: 'Submitted', reason: 'Unapproved transition',
    } })).rejects.toBeDefined();
  });

  it('enforces same-company active customer links and company-scoped reads', async () => {
    await expect(createRentalRequest(draftInput(otherCustomerId), managerId, companyId)).rejects.toBeInstanceOf(RentalCustomerNotFoundError);
    await expect(prisma.$executeRaw`INSERT INTO "RentalRequest" ("id", "companyId", "customerId", "status", "updatedAt") VALUES (${randomUUID()}, ${companyId}, ${otherCustomerId}, 'Draft', CURRENT_TIMESTAMP)`).rejects.toBeDefined();
    const draft = await createRentalRequest(draftInput(customerId), managerId, companyId);
    await expect(getRentalRequest({ actorId: otherManagerId, companyId: otherCompanyId, requestId: draft.id })).rejects.toBeInstanceOf(RentalRequestNotFoundError);
    const searched = await listRentalRequests({ actorId: managerId, companyId, search: 'Rental Test Customer' });
    expect(searched.requests.map(({ id }) => id)).toContain(draft.id);
  });

  it('preserves an already-linked customer that is later archived while rejecting new archived links', async () => {
    const historicalCustomer = await prisma.customer.create({ data: { companyId, displayName: `Archived link ${randomUUID()}` } });
    const draft = await createRentalRequest(draftInput(historicalCustomer.id), managerId, companyId);
    await prisma.customer.update({ where: { id: historicalCustomer.id }, data: { archivedAt: new Date() } });
    const updated = await updateRentalRequestDraft(draftInput(historicalCustomer.id, {
      purpose: 'Update while retaining existing customer relationship',
      reason: 'Preserve the historical customer link',
    }), managerId, companyId, draft.id);
    expect(updated.customerArchived).toBe(true);
    expect(updated.purpose).toBe('Update while retaining existing customer relationship');
    await expect(createRentalRequest(draftInput(historicalCustomer.id), managerId, companyId)).rejects.toBeInstanceOf(RentalCustomerNotFoundError);
  });

  it('submits only complete Drafts and records approved actor, audit and status history', async () => {
    const draft = await createRentalRequest(draftInput(customerId), managerId, companyId);
    await expect(submitRentalRequest({ reason: 'Submit incomplete draft' }, managerId, companyId, draft.id))
      .rejects.toBeInstanceOf(RentalRequestMissingSubmissionFieldsError);

    const ready = draftInput(customerId, {
      serviceDate: '2026-11-01', departureTime: '08:30', durationMinutes: 90,
      pickupLocation: 'Accra', destination: 'Kumasi', passengerCount: 12, requestSource: 'PHONE',
      reason: 'Complete required submission details',
    });
    await updateRentalRequestDraft(ready, managerId, companyId, draft.id);
    await expect(submitRentalRequest({ reason: 'Dispatcher cannot submit' }, dispatcherId, companyId, draft.id))
      .rejects.toBeInstanceOf(PermissionDeniedError);

    const submitted = await submitRentalRequest({ reason: 'Customer confirmed enquiry details' }, managerId, companyId, draft.id);
    expect(submitted.status).toBe('Submitted');
    const detail = await getRentalRequest({ actorId: managerId, companyId, requestId: draft.id });
    expect(detail.history).toHaveLength(2);
    expect(detail.history.map(({ toStatus }) => toStatus)).toEqual(expect.arrayContaining(['Draft', 'Submitted']));
    expect(await prisma.auditEvent.count({ where: { entityType: 'RENTAL_REQUEST', entityId: draft.id, action: 'RENTAL_REQUEST_SUBMITTED' } })).toBe(1);
    await expect(updateRentalRequestDraft(ready, managerId, companyId, draft.id)).rejects.toBeInstanceOf(RentalRequestNotDraftError);
    await expect(submitRentalRequest({ reason: 'Submit it again after completion' }, managerId, companyId, draft.id))
      .rejects.toBeInstanceOf(RentalRequestNotDraftError);
  });

  it('updates only Drafts and audits changes without adding a status transition', async () => {
    const draft = await createRentalRequest(draftInput(customerId), managerId, companyId);
    const updated = await updateRentalRequestDraft(draftInput(customerId, {
      serviceDate: '2026-11-01', departureTime: '08:30', passengerCount: 12,
      pickupLocation: 'Accra', destination: 'Kumasi', requestSource: 'PHONE',
      reason: 'Add information from customer call',
    }), managerId, companyId, draft.id);
    expect(updated.serviceDate).toBe('2026-11-01');
    expect(updated.status).toBe('Draft');
    const detail = await getRentalRequest({ actorId: managerId, companyId, requestId: draft.id });
    expect(detail.history).toHaveLength(1);
    expect(await prisma.auditEvent.count({ where: { entityType: 'RENTAL_REQUEST', entityId: draft.id, action: 'RENTAL_REQUEST_DRAFT_UPDATED' } })).toBe(1);
    await expect(updateRentalRequestDraft(draftInput(customerId), managerId, companyId, randomUUID())).rejects.toBeInstanceOf(RentalRequestNotFoundError);
  });
});
