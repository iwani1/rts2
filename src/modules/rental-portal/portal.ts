import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import {
  createRentalRequestForLinkedCustomer,
  submitOwnRentalRequest,
  updateOwnRentalRequestDraft,
  type RentalRequestRecord,
} from '@/modules/rentals/rental-requests';
import {
  customerLinkSchema,
  customerUnlinkSchema,
  ownRentalRequestSchema,
  portalReasonSchema,
} from './portal-schema';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 'P2002';
}

export class RentalPortalNotLinkedError extends Error {
  constructor() {
    super('This login is not linked to a rental customer record yet. Ask Richie Transport to link your account.');
    this.name = 'RentalPortalNotLinkedError';
  }
}
export class RentalPortalRequestNotFoundError extends Error {
  constructor() {
    super('That rental request was not found for your customer record.');
    this.name = 'RentalPortalRequestNotFoundError';
  }
}
export class RentalPortalPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RentalPortalPolicyError';
  }
}
export class RentalPortalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RentalPortalValidationError';
  }
}

export type RentalPortalRequestSummary = {
  requestId: string;
  status: string;
  serviceDate: string | null;
  departureTime: string | null;
  returnTime: string | null;
  returnDate: string | null;
  durationMinutes: number | null;
  pickupLocation: string | null;
  destination: string | null;
  intermediateStops: string | null;
  passengerCount: number | null;
  luggageSpecialNeeds: string | null;
  requestedVehicleType: string | null;
  driverRequirement: string | null;
  tripContactName: string | null;
  tripContactTelephone: string | null;
  tripContactEmail: string | null;
  notes: string | null;
  purpose: string | null;
  canEdit: boolean;
  canSubmit: boolean;
  canWithdraw: boolean;
  createdAt: Date;
};

export type RentalPortalHome = {
  companyId: string;
  profile: {
    displayName: string;
    reference: string | null;
    contactPerson: string | null;
    telephone: string | null;
    email: string | null;
    billingDetails: string | null;
    customerType: string | null;
  };
  requests: RentalPortalRequestSummary[];
  requestsTotal: number;
  /** D-066: no customer quotation model exists yet; stated, never invented. */
  quotations: { state: 'NONE_ISSUED'; message: string };
  /** D-066: rentals have no invoices yet; stated, never invented. */
  payments: { state: 'NONE_DUE'; message: string };
};

const companyIdSchema = z.string().trim().min(1).max(128);
const userIdSchema = z.string().trim().min(1).max(128);
const idSchema = z.string().trim().min(1).max(128);

async function rentalContext(input: { actorId: string; companyId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  const prisma = getPrisma();
  const [company, customer] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { status: true } }),
    prisma.customer.findFirst({
      where: { userId: input.actorId, companyId, archivedAt: null },
      select: {
        id: true, displayName: true, reference: true, contactPerson: true,
        telephone: true, email: true, billingDetails: true, customerType: true,
      },
    }),
  ]);
  if (company?.status !== 'ACTIVE') throw new RentalPortalNotLinkedError();
  if (!customer) throw new RentalPortalNotLinkedError();
  return { companyId, customer };
}

/** RNT-09: the linked customer's portal home (D-066). */
export async function getRentalPortalHome(input: { actorId: string; companyId: string }) {
  const { companyId, customer } = await rentalContext(input);
  const prisma = getPrisma();
  const requestsTotal = await prisma.rentalRequest.count({
    where: { companyId, customerId: customer.id },
  });
  const rows = await prisma.rentalRequest.findMany({
    where: { companyId, customerId: customer.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 100,
    select: {
      id: true, status: true, serviceDate: true, departureTime: true,
      returnTime: true, returnDate: true, durationMinutes: true,
      pickupLocation: true, destination: true, intermediateStops: true,
      passengerCount: true, luggageSpecialNeeds: true,
      requestedVehicleType: true, driverRequirement: true,
      tripContactName: true, tripContactTelephone: true, tripContactEmail: true,
      notes: true, purpose: true, createdAt: true,
    },
  });
  const home: RentalPortalHome = {
    companyId,
    profile: {
      displayName: customer.displayName,
      reference: customer.reference,
      contactPerson: customer.contactPerson,
      telephone: customer.telephone,
      email: customer.email,
      billingDetails: customer.billingDetails,
      customerType: customer.customerType,
    },
    requests: rows.map((row) => ({
      requestId: row.id,
      status: row.status,
      serviceDate: row.serviceDate ? row.serviceDate.toISOString().slice(0, 10) : null,
      departureTime: row.departureTime,
      returnTime: row.returnTime,
      returnDate: row.returnDate ? row.returnDate.toISOString().slice(0, 10) : null,
      durationMinutes: row.durationMinutes,
      pickupLocation: row.pickupLocation,
      destination: row.destination,
      intermediateStops: row.intermediateStops,
      passengerCount: row.passengerCount,
      luggageSpecialNeeds: row.luggageSpecialNeeds,
      requestedVehicleType: row.requestedVehicleType,
      driverRequirement: row.driverRequirement,
      tripContactName: row.tripContactName,
      tripContactTelephone: row.tripContactTelephone,
      tripContactEmail: row.tripContactEmail,
      notes: row.notes,
      purpose: row.purpose,
      canEdit: row.status === 'Draft',
      canSubmit: row.status === 'Draft',
      canWithdraw: row.status === 'Draft' || row.status === 'Submitted',
      createdAt: row.createdAt,
    })),
    requestsTotal,
    quotations: {
      state: 'NONE_ISSUED',
      message: 'No quotation has been issued for your requests yet. When our team issues one, it will appear here for your review.',
    },
    payments: {
      state: 'NONE_DUE',
      message: 'No payment is due. Rental invoices are not issued yet; this section will show amounts once invoicing is available.',
    },
  };
  return home;
}

/** RNT-09: create a Draft enquiry for the linked customer (source `APP`). */
export async function createOwnRentalRequest(
  input: unknown, actorId: string, companyIdInput: string,
): Promise<RentalRequestRecord> {
  const { companyId, customer } = await rentalContext({ actorId, companyId: companyIdInput });
  const data = ownRentalRequestSchema.parse(input);
  return createRentalRequestForLinkedCustomer(data, actorId, companyId, customer.id);
}

/** RNT-09: edit the linked customer's own Draft. */
export async function updateOwnRentalRequest(
  input: unknown, actorId: string, companyIdInput: string, requestIdInput: string,
): Promise<RentalRequestRecord> {
  const { companyId, customer } = await rentalContext({ actorId, companyId: companyIdInput });
  const data = ownRentalRequestSchema.parse(input);
  return updateOwnRentalRequestDraft(data, actorId, companyId, requestIdInput, customer.id);
}

/** RNT-09: submit the linked customer's own Draft under the shared rules. */
export async function submitOwnRentalPortalRequest(
  input: unknown, actorId: string, companyIdInput: string, requestIdInput: string,
): Promise<RentalRequestRecord> {
  const { companyId, customer } = await rentalContext({ actorId, companyId: companyIdInput });
  return submitOwnRentalRequest(input, actorId, companyId, requestIdInput, customer.id);
}

/**
 * RNT-09/D-066: the customer withdraws their own Draft or Submitted request.
 * Requests already under review stay with operations.
 */
export async function withdrawOwnRentalRequest(
  input: unknown, actorId: string, companyIdInput: string, requestIdInput: string,
): Promise<{ requestId: string; status: string }> {
  const { reason } = portalReasonSchema.parse(input);
  const { companyId, customer } = await rentalContext({ actorId, companyId: companyIdInput });
  const requestId = idSchema.parse(requestIdInput);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{ status: string; customerId: string }>>`
      SELECT "status", "customerId" FROM "RentalRequest"
      WHERE "id" = ${requestId} AND "companyId" = ${companyId} FOR UPDATE`;
    const current = rows[0];
    if (!current || current.customerId !== customer.id) throw new RentalPortalRequestNotFoundError();
    if (current.status !== 'Draft' && current.status !== 'Submitted') {
      throw new RentalPortalPolicyError(
        'This request is already being handled by our team and can no longer be withdrawn online. Please contact Richie Transport.',
      );
    }
    const changed = await tx.rentalRequest.updateMany({
      where: { id: requestId, companyId, status: current.status },
      data: { status: 'Cancelled' },
    });
    if (changed.count !== 1) throw new RentalPortalPolicyError('This request changed while withdrawing; please refresh and try again.');
    await tx.rentalRequestStatusHistory.create({
      data: { companyId, requestId, actorId, fromStatus: current.status, toStatus: 'Cancelled', reason },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'RENTAL_REQUEST_WITHDRAWN_BY_CUSTOMER',
        entityType: 'RENTAL_REQUEST', entityId: requestId,
        summary: { reason, via: 'rental-customer-portal' },
      },
    });
    return { requestId, status: 'Cancelled' };
  });
}

/**
 * D-066 link administration: a customer manager links an ACTIVE login holding
 * a Rental Customer assignment to exactly one customer record; unlinking
 * severs portal access. Both are audited.
 */

async function assertCustomerManager(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'customer:manage' });
  if (!permission.allowed || !(permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY'))) {
    throw new PermissionDeniedError();
  }
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new RentalPortalValidationError('Company not found.');
}

export async function linkCustomerAccount(input: {
  actorId: string; companyId: string; customerId: string; userId: string; reason: string;
}) {
  const data = customerLinkSchema.parse({ userId: input.userId, reason: input.reason });
  const companyId = companyIdSchema.parse(input.companyId);
  const customerId = userIdSchema.parse(input.customerId);
  await assertCustomerManager(input.actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const [customer, user, assignment, existingLink] = await Promise.all([
      tx.customer.findFirst({
        where: { id: customerId, companyId, archivedAt: null },
        select: { id: true, userId: true },
      }),
      tx.user.findUnique({ where: { id: data.userId }, select: { id: true, status: true } }),
      tx.userRoleAssignment.findFirst({
        where: { userId: data.userId, companyId, roleCode: 'RENTAL_CUSTOMER', revokedAt: null },
        select: { id: true },
      }),
      tx.customer.findFirst({ where: { userId: data.userId }, select: { id: true, companyId: true } }),
    ]);
    if (!customer) throw new RentalPortalValidationError('Customer record not found in this company.');
    if (customer.userId) {
      throw new RentalPortalValidationError('This customer is already linked to a login. Unlink it before linking a different login.');
    }
    if (!user || user.status !== 'ACTIVE') {
      throw new RentalPortalValidationError('The login must exist and be active before it can be linked.');
    }
    if (!assignment) {
      throw new RentalPortalValidationError('The login must hold the Rental Customer role in this company before it can be linked.');
    }
    if (existingLink) {
      throw new RentalPortalValidationError('That login is already linked to a customer record. Unlink it there first.');
    }
    try {
      await tx.customer.update({ where: { id: customer.id }, data: { userId: data.userId } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RentalPortalValidationError('That login or customer record was linked at the same moment. Refresh and try again.');
      }
      throw error;
    }
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId, companyId, action: 'CUSTOMER_ACCOUNT_LINKED',
        entityType: 'CUSTOMER', entityId: customer.id,
        summary: { reason: data.reason, userId: data.userId },
      },
    });
    return { customerId: customer.id, userId: data.userId };
  });
}

export async function unlinkCustomerAccount(input: {
  actorId: string; companyId: string; customerId: string; reason: string;
}) {
  const data = customerUnlinkSchema.parse({ reason: input.reason });
  const companyId = companyIdSchema.parse(input.companyId);
  const customerId = userIdSchema.parse(input.customerId);
  await assertCustomerManager(input.actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, companyId, archivedAt: null },
      select: { id: true, userId: true },
    });
    if (!customer) throw new RentalPortalValidationError('Customer record not found in this company.');
    if (!customer.userId) throw new RentalPortalValidationError('This customer is not linked to a login.');
    const previousUserId = customer.userId;
    await tx.customer.update({ where: { id: customer.id }, data: { userId: null } });
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId, companyId, action: 'CUSTOMER_ACCOUNT_UNLINKED',
        entityType: 'CUSTOMER', entityId: customer.id,
        summary: { reason: data.reason, userId: previousUserId },
      },
    });
    return { customerId: customer.id };
  });
}

export { PermissionDeniedError };
