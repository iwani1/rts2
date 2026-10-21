import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getBookingCreationCutoff, getInactiveContractBookingPolicy } from '@/modules/settings/registry';
import { getPrisma } from '@/server/prisma';
import { bookingListQuerySchema, bookingRequestSchema, bookingTransitionSchema } from './booking-schema';
import { isAllowedBookingTransition } from './booking-transitions';

const companyIdSchema = z.string().trim().min(1).max(128);
const bookingIdSchema = z.string().trim().min(1).max(128);
const ACTIVE_BOOKING_STATUSES = ['Pending', 'Accepted', 'Assigned', 'Boarded'] as const;

export class BookingCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'BookingCompanyNotFoundError'; }
}
export class BookingNotFoundError extends Error {
  readonly code = 'BOOKING_NOT_FOUND';
  constructor() { super('Booking not found.'); this.name = 'BookingNotFoundError'; }
}
export class InvalidBookingCursorError extends Error {
  readonly code = 'INVALID_BOOKING_CURSOR';
  constructor() { super('Invalid booking cursor.'); this.name = 'InvalidBookingCursorError'; }
}
export class BookingValidationError extends Error {
  readonly code = 'BOOKING_VALIDATION';
  constructor(message: string) { super(message); this.name = 'BookingValidationError'; }
}
export class BookingDuplicateError extends Error {
  readonly code = 'BOOKING_DUPLICATE';
  constructor() {
    super('This employee already has a live booking for the same journey (date, type and route). Cancel or complete the existing booking first.');
    this.name = 'BookingDuplicateError';
  }
}
export class BookingTransitionNotAllowedError extends Error {
  readonly code = 'BOOKING_TRANSITION_NOT_ALLOWED';
  constructor(readonly fromStatus: string, readonly toStatus: string) {
    super(`The transition from ${fromStatus} to ${toStatus} is not allowed.`);
    this.name = 'BookingTransitionNotAllowedError';
  }
}
export class BookingPolicyError extends Error {
  readonly code = 'BOOKING_POLICY';
  constructor(message: string) { super(message); this.name = 'BookingPolicyError'; }
}

export type BookingStatusHistoryRecord = {
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  actorName: string;
  createdAt: Date;
};

export type BookingRecord = {
  id: string;
  reference: string;
  clientId: string;
  clientName: string;
  employeeId: string;
  employeeName: string;
  contractId: string | null;
  routeId: string | null;
  routeName: string | null;
  bookingType: string;
  journeyDate: string;
  tripId: string | null;
  pickupLocationId: string | null;
  pickupName: string | null;
  dropoffLocationId: string | null;
  dropoffName: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type BookingDbShape = Omit<BookingRecord, 'journeyDate' | 'clientName' | 'employeeName' | 'routeName' | 'pickupName' | 'dropoffName'> & {
  journeyDate: Date;
  client: { name: string };
  employee: { fullName: string };
  route: { name: string } | null;
  pickupLocation: { name: string } | null;
  dropoffLocation: { name: string } | null;
};

const bookingInclude = {
  client: { select: { name: true } },
  employee: { select: { fullName: true } },
  route: { select: { name: true } },
  pickupLocation: { select: { name: true } },
  dropoffLocation: { select: { name: true } },
} as const;

function presentBooking(row: BookingDbShape): BookingRecord {
  return {
    id: row.id,
    reference: row.reference,
    clientId: row.clientId,
    clientName: row.client.name,
    employeeId: row.employeeId,
    employeeName: row.employee.fullName,
    contractId: row.contractId,
    routeId: row.routeId,
    routeName: row.route?.name ?? null,
    bookingType: row.bookingType,
    journeyDate: row.journeyDate.toISOString().slice(0, 10),
    tripId: row.tripId,
    pickupLocationId: row.pickupLocationId,
    pickupName: row.pickupLocation?.name ?? null,
    dropoffLocationId: row.dropoffLocationId,
    dropoffName: row.dropoffLocation?.name ?? null,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'booking:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new BookingCompanyNotFoundError();
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');
  if (!canManage) throw new PermissionDeniedError();
  return { canManage };
}

const accraDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit',
});

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

export async function listBookings(input: {
  actorId: string; companyId: string; search?: string; status?: string; bookingType?: string;
  clientId?: string; employeeId?: string; journeyDate?: string; cursor?: string;
}): Promise<{ bookings: BookingRecord[]; nextCursor: string | null; canManage: boolean }> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = bookingListQuerySchema.parse({
    search: input.search, status: input.status || undefined, bookingType: input.bookingType || undefined,
    clientId: input.clientId || undefined, employeeId: input.employeeId || undefined,
    journeyDate: input.journeyDate || undefined, cursor: input.cursor,
  });
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  if (query.cursor) {
    const cursorBooking = await prisma.booking.findFirst({ where: { id: query.cursor, companyId }, select: { id: true } });
    if (!cursorBooking) throw new InvalidBookingCursorError();
  }
  const rows = await prisma.booking.findMany({
    where: {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.bookingType ? { bookingType: query.bookingType } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.journeyDate ? { journeyDate: new Date(`${query.journeyDate}T00:00:00.000Z`) } : {}),
      ...(query.search ? { OR: [
        { reference: { contains: query.search, mode: 'insensitive' as const } },
        { employee: { is: { fullName: { contains: query.search, mode: 'insensitive' as const } } } },
        { client: { is: { name: { contains: query.search, mode: 'insensitive' as const } } } },
      ] } : {}),
    },
    include: bookingInclude,
    orderBy: [{ journeyDate: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const bookings = rows.slice(0, 50).map((row: BookingDbShape) => presentBooking(row));
  return { bookings, nextCursor: rows.length > 50 ? bookings.at(-1)?.id ?? null : null, canManage: access.canManage };
}

export async function getBooking(input: { actorId: string; companyId: string; bookingId: string }): Promise<{
  booking: BookingRecord; canManage: boolean; history: BookingStatusHistoryRecord[];
}> {
  const companyId = companyIdSchema.parse(input.companyId);
  const bookingId = bookingIdSchema.parse(input.bookingId);
  const access = await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const row = await prisma.booking.findFirst({
    where: { id: bookingId, companyId },
    include: {
      ...bookingInclude,
      statusHistory: { orderBy: { sequence: 'desc' }, take: 50, include: { actor: { select: { name: true } } } },
    },
  });
  if (!row) throw new BookingNotFoundError();
  return {
    booking: presentBooking(row),
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

/**
 * Creates a Pending booking after BKG-02 validation: the employee must be an
 * active, transport-eligible employee of the company; a supplied contract
 * must be in force for the employee's client (expired/suspended contracts
 * follow the configured inactive-contract policy, which blocks the booking
 * while unset); locations and route must be active same-company records; the
 * journey must not be in the past; and no live duplicate journey may exist.
 */
export async function createBooking(input: unknown, actorId: string, companyIdInput: string) {
  const data = bookingRequestSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  return executeBookingCreation(data, actorId, companyId);
}

/**
 * PAX-01 (D-065): the passenger self-service entry point. The caller
 * (passenger service) has already resolved the caller's audited employee
 * link, so this runs the identical creation core — eligibility, duplicate
 * journey, contract policy and creation cut-off — for that employee only.
 * The employeeId in the payload is ignored and replaced by the linked one.
 */
export async function createBookingForLinkedEmployee(
  input: unknown, actorId: string, companyIdInput: string, linkedEmployeeId: string,
) {
  const raw = bookingRequestSchema.parse({ ...(input as Record<string, unknown>), employeeId: linkedEmployeeId });
  const companyId = companyIdSchema.parse(companyIdInput);
  return executeBookingCreation(raw, actorId, companyId);
}

type BookingRequestData = ReturnType<typeof bookingRequestSchema.parse>;

async function executeBookingCreation(data: BookingRequestData, actorId: string, companyId: string) {
  const prisma = getPrisma();
  const today = accraDate.format(new Date());
  if (data.journeyDate < today) {
    throw new BookingValidationError('The journey date is in the past. Bookings can only be created for today or a future date.');
  }
  // BKG-05a (D-056): per-company creation cut-off. Unconfigured means NONE.
  const cutoff = await getBookingCreationCutoff(companyId);
  if (cutoff?.mode === 'HOURS_BEFORE_JOURNEY') {
    const journeyStart = new Date(`${data.journeyDate}T00:00:00.000Z`).getTime();
    const cutoffAt = journeyStart - cutoff.hours * 3_600_000;
    if (Date.now() > cutoffAt) {
      throw new BookingPolicyError(
        `Booking creation is closed for ${data.journeyDate}: the company cut-off is ${cutoff.hours} hour(s) before the journey starts.`,
      );
    }
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reference = `BKG-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    try {
      return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const employee = await tx.employee.findFirst({
          where: { id: data.employeeId, companyId, archivedAt: null },
          select: { id: true, clientId: true, transportEligible: true },
        });
        if (!employee) throw new BookingValidationError('Employee not found in this company, or the record is archived.');
        if (employee.transportEligible === false) {
          throw new BookingValidationError('This employee is recorded as not eligible for transport, so a booking cannot be created.');
        }
        if (employee.transportEligible === null) {
          throw new BookingValidationError('Transport eligibility has not been recorded for this employee. Record eligibility before booking.');
        }
        if (data.contractId) {
          const contract = await tx.contract.findFirst({
            where: { id: data.contractId, companyId },
            select: { clientId: true, status: true },
          });
          if (!contract || contract.clientId !== employee.clientId) {
            throw new BookingValidationError('Contract not found for this employee\u2019s client in this company.');
          }
          if (contract.status === 'Suspended' || contract.status === 'Expired') {
            const policy = await getInactiveContractBookingPolicy(companyId);
            if (policy === null) {
              throw new BookingPolicyError(
                `This contract is ${contract.status.toLowerCase()} and the booking policy for expired or suspended contracts (contracts.inactive_booking_policy) has not been configured. An administrator must set it before this booking can be created.`,
              );
            }
            if (policy === 'BLOCK') {
              throw new BookingPolicyError(`Bookings are not allowed under a ${contract.status.toLowerCase()} contract under the configured policy.`);
            }
          } else if (contract.status !== 'Active') {
            throw new BookingValidationError(`Bookings can only be made under an Active contract; this contract is ${contract.status}.`);
          }
        }
        if (data.routeId) {
          const route = await tx.route.findFirst({
            where: { id: data.routeId, companyId, archivedAt: null },
            select: { clientId: true },
          });
          if (!route) throw new BookingValidationError('Route not found in this company, or it is archived.');
          if (route.clientId !== employee.clientId) {
            throw new BookingValidationError('This route belongs to a different client than the employee.');
          }
        }
        for (const [field, locationId] of [['pickup', data.pickupLocationId], ['drop-off', data.dropoffLocationId]] as const) {
          if (!locationId) continue;
          const location = await tx.location.findFirst({
            where: { id: locationId, companyId, archivedAt: null }, select: { id: true },
          });
          if (!location) throw new BookingValidationError(`The ${field} location was not found in this company, or it is archived.`);
        }
        const journeyDate = new Date(`${data.journeyDate}T00:00:00.000Z`);
        const duplicate = await tx.booking.findFirst({
          where: {
            companyId, employeeId: employee.id, journeyDate,
            bookingType: data.bookingType, routeId: data.routeId,
            status: { in: [...ACTIVE_BOOKING_STATUSES] },
          },
          select: { id: true },
        });
        if (duplicate) throw new BookingDuplicateError();
        const booking = await tx.booking.create({
          data: {
            companyId,
            clientId: employee.clientId,
            employeeId: employee.id,
            contractId: data.contractId,
            routeId: data.routeId,
            reference,
            bookingType: data.bookingType,
            journeyDate,
            pickupLocationId: data.pickupLocationId,
            dropoffLocationId: data.dropoffLocationId,
            notes: data.notes || null,
            status: 'Pending',
          },
          include: bookingInclude,
        });
        await tx.bookingStatusHistory.create({
          data: { companyId, bookingId: booking.id, sequence: 1, actorId, fromStatus: null, toStatus: 'Pending', reason: data.reason },
        });
        await tx.auditEvent.create({
          data: {
            actorId, companyId, action: 'BOOKING_CREATED', entityType: 'BOOKING', entityId: booking.id,
            summary: {
              reference, employeeId: employee.id, bookingType: data.bookingType,
              journeyDate: data.journeyDate, reason: data.reason,
            },
          },
        });
        return presentBooking(booking);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Either a reference collision (retry with a new reference) or the
        // database duplicate-journey index won a concurrent race.
        if (attempt === 2) throw new BookingDuplicateError();
        const existing = await prisma.booking.findFirst({
          where: {
            companyId, employeeId: data.employeeId,
            journeyDate: new Date(`${data.journeyDate}T00:00:00.000Z`),
            bookingType: data.bookingType, routeId: data.routeId,
            status: { in: [...ACTIVE_BOOKING_STATUSES] },
          },
          select: { id: true },
        });
        if (existing) throw new BookingDuplicateError();
        continue;
      }
      throw error;
    }
  }
  throw new BookingDuplicateError();
}

/**
 * Applies the staff-side booking transitions (accept, reject, cancel).
 * Assignment, boarding and completion arrive through the trip, dispatch and
 * driver flows and are refused here so no path bypasses them.
 */
export async function transitionBooking(input: unknown, actorId: string, companyIdInput: string, bookingIdInput: string) {
  const data = bookingTransitionSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const bookingId = bookingIdSchema.parse(bookingIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{ status: string; reference: string }>>`
      SELECT "status", "reference" FROM "Booking"
      WHERE "id" = ${bookingId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new BookingNotFoundError();
    if (!isAllowedBookingTransition(current.status, data.toStatus)) {
      throw new BookingTransitionNotAllowedError(current.status, data.toStatus);
    }
    if (['Assigned', 'Boarded', 'Completed'].includes(data.toStatus)) {
      throw new BookingPolicyError('Assignment, boarding and completion are recorded through trip assignment and driver events, not manual status changes.');
    }
    if (data.toStatus === 'Accepted' && current.status === 'Assigned') {
      throw new BookingPolicyError('Unassigning a booking from its trip is done from the dispatch board, not manual status changes.');
    }
    const changed = await tx.booking.updateMany({
      where: { id: bookingId, companyId, status: current.status },
      data: { status: data.toStatus },
    });
    if (changed.count !== 1) throw new BookingTransitionNotAllowedError(current.status, data.toStatus);
    const latest = await tx.bookingStatusHistory.findFirst({
      where: { companyId, bookingId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    await tx.bookingStatusHistory.create({
      data: {
        companyId, bookingId, sequence: (latest?.sequence ?? 0) + 1, actorId,
        fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING', entityId: bookingId,
        summary: { reference: current.reference, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason },
      },
    });
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude });
    return presentBooking(booking);
  });
}
