import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { missingRentalRequestSubmissionFields, rentalRequestDraftSchema, rentalRequestListQuerySchema, rentalRequestSubmitSchema } from './rental-request-schema';
import { isAllowedRentalRequestTransition } from './rental-request-transitions';

const companyIdSchema = z.string().trim().min(1).max(128);
const requestIdSchema = z.string().trim().min(1).max(128);

export class RentalCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'RentalCompanyNotFoundError'; }
}
export class RentalRequestNotFoundError extends Error {
  readonly code = 'RENTAL_REQUEST_NOT_FOUND';
  constructor() { super('Rental request not found.'); this.name = 'RentalRequestNotFoundError'; }
}
export class InvalidRentalRequestCursorError extends Error {
  readonly code = 'INVALID_RENTAL_REQUEST_CURSOR';
  constructor() { super('Invalid rental request cursor.'); this.name = 'InvalidRentalRequestCursorError'; }
}
export class RentalCustomerNotFoundError extends Error {
  readonly code = 'RENTAL_CUSTOMER_NOT_FOUND';
  constructor() { super('Active customer not found in this company.'); this.name = 'RentalCustomerNotFoundError'; }
}
export class RentalRequestNotDraftError extends Error {
  readonly code = 'RENTAL_REQUEST_NOT_DRAFT';
  constructor() { super('Only a Draft request may be changed or submitted.'); this.name = 'RentalRequestNotDraftError'; }
}
export class RentalRequestTransitionNotAllowedError extends Error {
  readonly code = 'RENTAL_REQUEST_TRANSITION_NOT_ALLOWED';
  constructor(readonly fromStatus: string, readonly toStatus: string) {
    super(`The transition from ${fromStatus} to ${toStatus} is not allowed.`);
    this.name = 'RentalRequestTransitionNotAllowedError';
  }
}
export class RentalRequestMissingSubmissionFieldsError extends Error {
  readonly code = 'RENTAL_REQUEST_MISSING_SUBMISSION_FIELDS';
  constructor(readonly missingFields: string[]) {
    super(`Add the required information before submitting: ${missingFields.join(', ')}.`);
    this.name = 'RentalRequestMissingSubmissionFieldsError';
  }
}

export type RentalRequestStatusHistoryRecord = {
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  actorName: string;
  createdAt: Date;
};

export type RentalRequestRecord = {
  id: string;
  customerId: string;
  customerName: string;
  customerArchived: boolean;
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
  purpose: string | null;
  requestedVehicleType: string | null;
  driverRequirement: string | null;
  tripContactName: string | null;
  tripContactTelephone: string | null;
  tripContactEmail: string | null;
  notes: string | null;
  requestSource: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type RentalRequestDbShape = Omit<RentalRequestRecord, 'serviceDate' | 'returnDate' | 'customerArchived' | 'customerName'> & {
  serviceDate: Date | null;
  returnDate: Date | null;
  customer: { displayName: string; archivedAt: Date | null };
};

function presentRequest(row: RentalRequestDbShape): RentalRequestRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer.displayName,
    customerArchived: row.customer.archivedAt !== null,
    serviceDate: row.serviceDate?.toISOString().slice(0, 10) ?? null,
    departureTime: row.departureTime,
    returnTime: row.returnTime,
    returnDate: row.returnDate?.toISOString().slice(0, 10) ?? null,
    durationMinutes: row.durationMinutes,
    pickupLocation: row.pickupLocation,
    destination: row.destination,
    intermediateStops: row.intermediateStops,
    passengerCount: row.passengerCount,
    luggageSpecialNeeds: row.luggageSpecialNeeds,
    purpose: row.purpose,
    requestedVehicleType: row.requestedVehicleType,
    driverRequirement: row.driverRequirement,
    tripContactName: row.tripContactName,
    tripContactTelephone: row.tripContactTelephone,
    tripContactEmail: row.tripContactEmail,
    notes: row.notes,
    requestSource: row.requestSource,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRequestData(input: z.infer<typeof rentalRequestDraftSchema>) {
  return {
    customerId: input.customerId,
    serviceDate: input.serviceDate ? new Date(`${input.serviceDate}T00:00:00.000Z`) : null,
    departureTime: input.departureTime,
    returnTime: input.returnTime,
    returnDate: input.returnDate ? new Date(`${input.returnDate}T00:00:00.000Z`) : null,
    durationMinutes: input.durationMinutes,
    pickupLocation: input.pickupLocation || null,
    destination: input.destination || null,
    intermediateStops: input.intermediateStops || null,
    passengerCount: input.passengerCount,
    luggageSpecialNeeds: input.luggageSpecialNeeds || null,
    purpose: input.purpose || null,
    requestedVehicleType: input.requestedVehicleType || null,
    driverRequirement: input.driverRequirement || null,
    tripContactName: input.tripContactName || null,
    tripContactTelephone: input.tripContactTelephone || null,
    tripContactEmail: input.tripContactEmail || null,
    notes: input.notes || null,
    requestSource: input.requestSource,
  };
}

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'rental:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new RentalCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  // Dispatcher enquiry/customer scopes lack the required request field projection; fail closed here.
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

export async function listRentalRequests(input: { actorId: string; companyId: string; search?: string; cursor?: string }): Promise<{
  requests: RentalRequestRecord[]; nextCursor: string | null; canManage: boolean;
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = rentalRequestListQuerySchema.parse({ search: input.search, cursor: input.cursor });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorRequest = await prisma.rentalRequest.findFirst({ where: { id: query.cursor, companyId }, select: { id: true } });
    if (!cursorRequest) throw new InvalidRentalRequestCursorError();
  }
  const where = {
    companyId,
    ...(query.search ? { OR: [
      { customer: { is: { displayName: { contains: query.search, mode: 'insensitive' as const } } } },
      { pickupLocation: { contains: query.search, mode: 'insensitive' as const } },
      { destination: { contains: query.search, mode: 'insensitive' as const } },
    ] } : {}),
  };
  const rows = await prisma.rentalRequest.findMany({
    where,
    include: { customer: { select: { displayName: true, archivedAt: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const requests = rows.slice(0, 50).map((row: RentalRequestDbShape) => presentRequest(row));
  return { requests, nextCursor: rows.length > 50 ? requests.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getRentalRequest(input: { actorId: string; companyId: string; requestId: string }): Promise<{
  request: RentalRequestRecord; canManage: boolean; history: RentalRequestStatusHistoryRecord[];
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const requestId = requestIdSchema.parse(input.requestId);
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const row = await prisma.rentalRequest.findFirst({
    where: { id: requestId, companyId },
    include: {
      customer: { select: { displayName: true, archivedAt: true } },
      statusHistory: { orderBy: { createdAt: 'desc' }, take: 50, include: { actor: { select: { name: true } } } },
    },
  });
  if (!row) throw new RentalRequestNotFoundError();
  return {
    request: presentRequest(row),
    canManage: access.canManage,
    history: row.statusHistory.map((entry: {
      fromStatus: string | null; toStatus: string; reason: string; createdAt: Date; actor: { name: string };
    }) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      reason: entry.reason,
      actorName: entry.actor.name,
      createdAt: entry.createdAt,
    })),
  };
}

export async function createRentalRequest(input: unknown, actorId: string, companyIdInput: string) {
  const data = rentalRequestDraftSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, companyId, archivedAt: null }, select: { id: true } });
    if (!customer) throw new RentalCustomerNotFoundError();
    const request = await tx.rentalRequest.create({
      data: { ...toRequestData(data), companyId, status: 'Draft' },
      include: { customer: { select: { displayName: true, archivedAt: true } } },
    });
    await tx.rentalRequestStatusHistory.create({
      data: { companyId, requestId: request.id, actorId, fromStatus: null, toStatus: 'Draft', reason: data.reason },
    });
    await tx.auditEvent.create({
      data: { actorId, companyId, action: 'RENTAL_REQUEST_DRAFT_CREATED', entityType: 'RENTAL_REQUEST', entityId: request.id, summary: { reason: data.reason } },
    });
    return presentRequest(request);
  });
}

export async function updateRentalRequestDraft(input: unknown, actorId: string, companyIdInput: string, requestIdInput: string) {
  const data = rentalRequestDraftSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const requestId = requestIdSchema.parse(requestIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const current = await tx.rentalRequest.findFirst({
      where: { id: requestId, companyId }, select: { status: true, customerId: true },
    });
    if (!current) throw new RentalRequestNotFoundError();
    if (current.status !== 'Draft') throw new RentalRequestNotDraftError();
    if (data.customerId !== current.customerId) {
      const customer = await tx.customer.findFirst({ where: { id: data.customerId, companyId, archivedAt: null }, select: { id: true } });
      if (!customer) throw new RentalCustomerNotFoundError();
    }
    const changed = await tx.rentalRequest.updateMany({
      where: { id: requestId, companyId, status: 'Draft' },
      data: toRequestData(data),
    });
    if (changed.count !== 1) {
      const exists = await tx.rentalRequest.findFirst({ where: { id: requestId, companyId }, select: { status: true } });
      if (!exists) throw new RentalRequestNotFoundError();
      throw new RentalRequestNotDraftError();
    }
    const request = await tx.rentalRequest.findUniqueOrThrow({
      where: { id: requestId }, include: { customer: { select: { displayName: true, archivedAt: true } } },
    });
    await tx.auditEvent.create({
      data: { actorId, companyId, action: 'RENTAL_REQUEST_DRAFT_UPDATED', entityType: 'RENTAL_REQUEST', entityId: request.id, summary: { reason: data.reason } },
    });
    return presentRequest(request);
  });
}

export async function submitRentalRequest(input: unknown, actorId: string, companyIdInput: string, requestIdInput: string) {
  const data = rentalRequestSubmitSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const requestId = requestIdSchema.parse(requestIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{
      status: string;
      serviceDate: Date | null;
      departureTime: string | null;
      returnTime: string | null;
      returnDate: Date | null;
      durationMinutes: number | null;
      pickupLocation: string | null;
      destination: string | null;
      passengerCount: number | null;
      requestSource: string | null;
    }>>`SELECT "status", "serviceDate", "departureTime", "returnTime", "returnDate", "durationMinutes", "pickupLocation", "destination", "passengerCount", "requestSource" FROM "RentalRequest" WHERE "id" = ${requestId} AND "companyId" = ${companyId} FOR UPDATE`;
    const current = rows[0];
    if (!current) throw new RentalRequestNotFoundError();
    if (current.status !== 'Draft') throw new RentalRequestNotDraftError();

    const missingFields = missingRentalRequestSubmissionFields(current);
    if (missingFields.length > 0) throw new RentalRequestMissingSubmissionFieldsError(missingFields);

    const changed = await tx.rentalRequest.updateMany({
      where: { id: requestId, companyId, status: 'Draft' },
      data: { status: 'Submitted' },
    });
    if (changed.count !== 1) throw new RentalRequestNotDraftError();
    await tx.rentalRequestStatusHistory.create({
      data: { companyId, requestId, actorId, fromStatus: 'Draft', toStatus: 'Submitted', reason: data.reason },
    });
    await tx.auditEvent.create({
      data: { actorId, companyId, action: 'RENTAL_REQUEST_SUBMITTED', entityType: 'RENTAL_REQUEST', entityId: requestId, summary: { reason: data.reason } },
    });
    const request = await tx.rentalRequest.findUniqueOrThrow({
      where: { id: requestId }, include: { customer: { select: { displayName: true, archivedAt: true } } },
    });
    return presentRequest(request);
  });
}

const rentalRequestTransitionSchema = z.object({
  toStatus: z.enum(['Under Review', 'Declined']),
  reason: z.string().trim().min(8).max(500),
}).strict();

/** Applies only the explicit, non-reserving review/decline transitions approved in D-032. */
export async function transitionRentalRequest(input: unknown, actorId: string, companyIdInput: string, requestIdInput: string) {
  const data = rentalRequestTransitionSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const requestId = requestIdSchema.parse(requestIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "RentalRequest"
      WHERE "id" = ${requestId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new RentalRequestNotFoundError();
    if (!isAllowedRentalRequestTransition(current.status, data.toStatus)) {
      throw new RentalRequestTransitionNotAllowedError(current.status, data.toStatus);
    }

    const changed = await tx.rentalRequest.updateMany({
      where: { id: requestId, companyId, status: current.status },
      data: { status: data.toStatus },
    });
    if (changed.count !== 1) throw new RentalRequestTransitionNotAllowedError(current.status, data.toStatus);
    await tx.rentalRequestStatusHistory.create({
      data: { companyId, requestId, actorId, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'RENTAL_REQUEST_STATUS_CHANGED', entityType: 'RENTAL_REQUEST', entityId: requestId,
        summary: { fromStatus: current.status, toStatus: data.toStatus, reason: data.reason },
      },
    });
    const request = await tx.rentalRequest.findUniqueOrThrow({
      where: { id: requestId }, include: { customer: { select: { displayName: true, archivedAt: true } } },
    });
    return presentRequest(request);
  });
}
