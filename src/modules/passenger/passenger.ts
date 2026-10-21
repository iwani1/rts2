import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { createBookingForLinkedEmployee, type BookingRecord } from '../bookings/bookings';
import {
  passengerCancelSchema,
  passengerFeedbackSchema,
  passengerJourneyRequestSchema,
  passengerLinkSchema,
  passengerUnlinkSchema,
} from './passenger-schema';
import { passengerJourneyStatus, type PassengerJourneyStatus } from './journey-status';

const companyIdSchema = z.string().trim().min(1).max(128);
const bookingIdSchema = z.string().trim().min(1).max(128);
const employeeIdSchema = z.string().trim().min(1).max(128);

export class PassengerCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'PassengerCompanyNotFoundError'; }
}
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === 'P2002';
}

export class PassengerNotLinkedError extends Error {
  readonly code = 'PASSENGER_NOT_LINKED';
  constructor() {
    super('Your login is not linked to an employee transport record yet. Ask the operations team to link it before using the passenger portal.');
    this.name = 'PassengerNotLinkedError';
  }
}
export class PassengerValidationError extends Error {
  readonly code = 'PASSENGER_VALIDATION';
  constructor(message: string) { super(message); this.name = 'PassengerValidationError'; }
}
export class PassengerPolicyError extends Error {
  readonly code = 'PASSENGER_POLICY';
  constructor(message: string) { super(message); this.name = 'PassengerPolicyError'; }
}
export class PassengerBookingNotFoundError extends Error {
  readonly code = 'BOOKING_NOT_FOUND';
  constructor() { super('Booking not found.'); this.name = 'PassengerBookingNotFoundError'; }
}

type LinkedEmployee = {
  id: string;
  clientId: string;
  clientName: string;
  fullName: string;
  department: string | null;
  workLocation: string | null;
  shift: string | null;
  approvedPickupLocation: string | null;
  approvedDropoffLocation: string | null;
  transportEligible: boolean | null;
  accountStatus: string | null;
};

/**
 * Every portal read and action resolves the caller through the audited
 * employee link (D-065). Nothing in the portal accepts an employee id from
 * the client, so one passenger can never reach another's record.
 */
async function passengerContext(actorId: string, companyId: string): Promise<LinkedEmployee> {
  const prisma = getPrisma();
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new PassengerCompanyNotFoundError();
  const employee = await prisma.employee.findFirst({
    where: { companyId, userId: actorId, archivedAt: null },
    select: {
      id: true, clientId: true, fullName: true, department: true, workLocation: true,
      shift: true, approvedPickupLocation: true, approvedDropoffLocation: true,
      transportEligible: true, accountStatus: true,
      client: { select: { name: true } },
    },
  });
  if (!employee) throw new PassengerNotLinkedError();
  return {
    id: employee.id,
    clientId: employee.clientId,
    clientName: employee.client.name,
    fullName: employee.fullName,
    department: employee.department,
    workLocation: employee.workLocation,
    shift: employee.shift,
    approvedPickupLocation: employee.approvedPickupLocation,
    approvedDropoffLocation: employee.approvedDropoffLocation,
    transportEligible: employee.transportEligible,
    accountStatus: employee.accountStatus,
  };
}

export type PassengerJourney = {
  bookingId: string;
  reference: string;
  bookingType: string;
  journeyDate: string;
  status: PassengerJourneyStatus;
  bookingStatus: string;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  pickupTime: string | null;
  tripReference: string | null;
  /** DRV-03 (D-073): the passenger's own single-use boarding code, shown only while it can still be used. */
  boardingCode: string | null;
  vehicleRegistration: string | null;
  canCancel: boolean;
  feedback: { rating: number | null; comment: string; createdAt: Date } | null;
};

type JourneyRow = {
  id: string; reference: string; bookingType: string; journeyDate: Date; status: string;
  pickupLocation: { name: string } | null;
  dropoffLocation: { name: string } | null;
  trip: {
    reference: string; status: string; plannedStartTime: string | null;
    vehicle: { registrationNumber: string } | null;
  } | null;
  passengerFeedback: Array<{ rating: number | null; comment: string; createdAt: Date }>;
  boardingCode: { code: string; expiresAt: Date; usedAt: Date | null } | null;
};

function presentJourney(row: JourneyRow): PassengerJourney {
  const status = passengerJourneyStatus(row.status, row.trip?.status ?? null);
  return {
    bookingId: row.id,
    reference: row.reference,
    bookingType: row.bookingType,
    journeyDate: row.journeyDate.toISOString().slice(0, 10),
    status,
    bookingStatus: row.status,
    pickupLocation: row.pickupLocation?.name ?? null,
    dropoffLocation: row.dropoffLocation?.name ?? null,
    pickupTime: row.trip?.plannedStartTime ?? null,
    tripReference: row.trip?.reference ?? null,
    vehicleRegistration: row.trip?.vehicle?.registrationNumber ?? null,
    canCancel: row.status === 'Pending' || row.status === 'Accepted',
    boardingCode: row.status === 'Assigned' && row.boardingCode && !row.boardingCode.usedAt
      && row.boardingCode.expiresAt >= new Date()
      ? row.boardingCode.code
      : null,
    feedback: row.passengerFeedback[0]
      ? {
        rating: row.passengerFeedback[0].rating,
        comment: row.passengerFeedback[0].comment,
        createdAt: row.passengerFeedback[0].createdAt,
      }
      : null,
  };
}

const journeyInclude = {
  pickupLocation: { select: { name: true } },
  dropoffLocation: { select: { name: true } },
  trip: {
    select: {
      reference: true, status: true, plannedStartTime: true,
      vehicle: { select: { registrationNumber: true } },
    },
  },
  passengerFeedback: { select: { rating: true, comment: true, createdAt: true } },
  boardingCode: { select: { code: true, expiresAt: true, usedAt: true } },
} satisfies Prisma.BookingInclude;

export type PassengerHome = {
  profile: LinkedEmployee;
  arrangements: {
    contracts: Array<{ reference: string; status: string; serviceType: string | null }>;
    routes: Array<{
      reference: string; name: string; serviceType: string | null;
      plannedStartTime: string | null; operatingDays: string[];
    }>;
  };
  upcoming: PassengerJourney[];
  history: PassengerJourney[];
  upcomingTotal: number;
  historyTotal: number;
};

/** PAX-01 portal home: own profile, approved options and journey lists. */
export async function getPassengerHome(input: {
  actorId: string; companyId: string;
}): Promise<PassengerHome> {
  const companyId = companyIdSchema.parse(input.companyId);
  const employee = await passengerContext(input.actorId, companyId);
  const prisma = getPrisma();
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const [contracts, routes, upcoming, history, upcomingTotal, historyTotal] = await Promise.all([
    prisma.contract.findMany({
      where: { companyId, clientId: employee.clientId, status: 'Active' },
      orderBy: { createdAt: 'desc' },
      select: { reference: true, status: true, serviceType: true },
      take: 10,
    }),
    prisma.route.findMany({
      where: { companyId, clientId: employee.clientId, archivedAt: null, active: true },
      orderBy: { reference: 'asc' },
      select: { reference: true, name: true, serviceType: true, plannedStartTime: true, operatingDays: true },
      take: 50,
    }),
    prisma.booking.findMany({
      where: {
        companyId, employeeId: employee.id,
        journeyDate: { gte: today }, status: { notIn: ['Cancelled', 'Rejected', 'Completed'] },
      },
      include: journeyInclude,
      orderBy: [{ journeyDate: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    }),
    prisma.booking.findMany({
      where: {
        companyId, employeeId: employee.id,
        OR: [{ journeyDate: { lt: today } }, { status: { in: ['Cancelled', 'Rejected', 'Completed'] } }],
      },
      include: journeyInclude,
      orderBy: [{ journeyDate: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    }),
    prisma.booking.count({
      where: {
        companyId, employeeId: employee.id,
        journeyDate: { gte: today }, status: { notIn: ['Cancelled', 'Rejected', 'Completed'] },
      },
    }),
    prisma.booking.count({
      where: {
        companyId, employeeId: employee.id,
        OR: [{ journeyDate: { lt: today } }, { status: { in: ['Cancelled', 'Rejected', 'Completed'] } }],
      },
    }),
  ]);
  return {
    profile: employee,
    arrangements: {
      contracts: contracts.map((contract: { reference: string; status: string; serviceType: string | null }) => ({
        reference: contract.reference, status: contract.status, serviceType: contract.serviceType,
      })),
      routes: routes.map((route: {
        reference: string; name: string; serviceType: string | null;
        plannedStartTime: string | null; operatingDays: string[];
      }) => ({
        reference: route.reference, name: route.name, serviceType: route.serviceType,
        plannedStartTime: route.plannedStartTime, operatingDays: route.operatingDays,
      })),
    },
    upcoming: (upcoming as JourneyRow[]).map(presentJourney),
    history: (history as JourneyRow[]).map(presentJourney),
    upcomingTotal,
    historyTotal,
  };
}

/**
 * Requests a journey for the linked employee through the shared booking
 * creation core (eligibility, duplicates, contract policy, cut-off — D-065).
 */
export async function requestPassengerJourney(
  input: unknown, actorId: string, companyIdInput: string,
): Promise<BookingRecord> {
  const companyId = companyIdSchema.parse(companyIdInput);
  const employee = await passengerContext(actorId, companyId);
  const data = passengerJourneyRequestSchema.parse(input);
  return createBookingForLinkedEmployee(
    { ...data, reason: 'Passenger journey request via portal' },
    actorId, companyId, employee.id,
  );
}

/**
 * Cancels the passenger's own booking while it is still cancellable
 * (Pending/Accepted). Once a booking is Assigned to a trip, cancellation is
 * an operations action and the portal refuses with that explanation.
 */
export async function cancelPassengerJourney(
  input: unknown, actorId: string, companyIdInput: string, bookingIdInput: string,
): Promise<PassengerJourney> {
  const data = passengerCancelSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const bookingId = bookingIdSchema.parse(bookingIdInput);
  const employee = await passengerContext(actorId, companyId);
  const prisma = getPrisma();
  const journey = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rows = await tx.$queryRaw<Array<{ status: string; reference: string; employeeId: string }>>`
      SELECT "status", "reference", "employeeId" FROM "Booking"
      WHERE "id" = ${bookingId} AND "companyId" = ${companyId}
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current || current.employeeId !== employee.id) throw new PassengerBookingNotFoundError();
    if (current.status !== 'Pending' && current.status !== 'Accepted') {
      throw new PassengerPolicyError(
        'This journey can no longer be cancelled from the portal because it has been assigned to a trip. Please contact the operations team.',
      );
    }
    const changed = await tx.booking.updateMany({
      where: { id: bookingId, companyId, employeeId: employee.id, status: current.status },
      data: { status: 'Cancelled' },
    });
    if (changed.count !== 1) {
      throw new PassengerPolicyError('This journey changed while it was being cancelled; reload and try again.');
    }
    const latest = await tx.bookingStatusHistory.findFirst({
      where: { companyId, bookingId }, orderBy: { sequence: 'desc' }, select: { sequence: true },
    });
    await tx.bookingStatusHistory.create({
      data: {
        companyId, bookingId, sequence: (latest?.sequence ?? 0) + 1, actorId,
        fromStatus: current.status, toStatus: 'Cancelled', reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'BOOKING_STATUS_CHANGED', entityType: 'BOOKING', entityId: bookingId,
        summary: { reference: current.reference, fromStatus: current.status, toStatus: 'Cancelled', reason: data.reason, via: 'passenger-portal' },
      },
    });
    return tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: journeyInclude });
  });
  return presentJourney(journey as JourneyRow);
}

/** Records the passenger's feedback for their own Completed journey (once). */
export async function submitPassengerFeedback(
  input: unknown, actorId: string, companyIdInput: string, bookingIdInput: string,
): Promise<{ bookingId: string; rating: number | null; comment: string }> {
  const data = passengerFeedbackSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const bookingId = bookingIdSchema.parse(bookingIdInput);
  const employee = await passengerContext(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, companyId, employeeId: employee.id },
      select: { id: true, status: true },
    });
    if (!booking) throw new PassengerBookingNotFoundError();
    if (booking.status !== 'Completed') {
      throw new PassengerPolicyError('Feedback can only be recorded after a journey is completed.');
    }
    const existing = await tx.passengerFeedback.findFirst({
      where: { companyId, bookingId }, select: { id: true },
    });
    if (existing) {
      throw new PassengerPolicyError('Feedback has already been recorded for this journey and cannot be changed.');
    }
    let feedback;
    try {
      feedback = await tx.passengerFeedback.create({
        data: { companyId, bookingId, employeeId: employee.id, rating: data.rating, comment: data.comment },
        select: { bookingId: true, rating: true, comment: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PassengerPolicyError('Feedback has already been recorded for this journey and cannot be changed.');
      }
      throw error;
    }
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'PASSENGER_FEEDBACK_RECORDED', entityType: 'BOOKING', entityId: bookingId,
        summary: { rating: data.rating, via: 'passenger-portal' },
      },
    });
    return feedback;
  });
}

async function assertLinkManager(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'employee:manage' });
  if (!permission.allowed || !(permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY'))) {
    throw new PermissionDeniedError();
  }
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new PassengerCompanyNotFoundError();
}

/**
 * D-065: links a passenger login to an employee record (audited). The login
 * must be active and hold a PASSENGER assignment in this company; each side
 * can be linked only once until unlinked.
 */
export async function linkPassengerAccount(input: {
  actorId: string; companyId: string; employeeId: string; userId: string; reason: string;
}) {
  const companyId = companyIdSchema.parse(input.companyId);
  const employeeId = employeeIdSchema.parse(input.employeeId);
  const data = passengerLinkSchema.parse({ userId: input.userId, reason: input.reason });
  await assertLinkManager(input.actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const [employee, user, role, clash] = await Promise.all([
      tx.employee.findFirst({
        where: { id: employeeId, companyId, archivedAt: null },
        select: { id: true, fullName: true, userId: true },
      }),
      tx.user.findUnique({ where: { id: data.userId }, select: { id: true, status: true } }),
      tx.userRoleAssignment.findFirst({
        where: { userId: data.userId, companyId, roleCode: 'PASSENGER', revokedAt: null },
        select: { id: true },
      }),
      tx.employee.findFirst({
        where: { companyId, userId: data.userId }, select: { id: true },
      }),
    ]);
    if (!employee) throw new PassengerValidationError('Employee not found in this company, or the record is archived.');
    if (!user || user.status !== 'ACTIVE') throw new PassengerValidationError('The login account must exist and be active.');
    if (!role) throw new PassengerValidationError('Only users with an active Passenger assignment in this company can be linked to an employee record.');
    if (employee.userId) throw new PassengerValidationError('This employee record is already linked to a login. Unlink it before linking another.');
    if (clash) throw new PassengerValidationError('This login is already linked to another employee record. Unlink it there first.');
    try {
      await tx.employee.update({ where: { id: employee.id }, data: { userId: data.userId } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PassengerValidationError('That login or employee record was linked at the same moment. Refresh and try again.');
      }
      throw error;
    }
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId, companyId, action: 'EMPLOYEE_ACCOUNT_LINKED', entityType: 'EMPLOYEE', entityId: employee.id,
        summary: { employeeName: employee.fullName, userId: data.userId, reason: data.reason },
      },
    });
    return { employeeId: employee.id, userId: data.userId };
  });
}

/** Removes a passenger link (audited); the login keeps its role assignment. */
export async function unlinkPassengerAccount(input: {
  actorId: string; companyId: string; employeeId: string; reason: string;
}) {
  const companyId = companyIdSchema.parse(input.companyId);
  const employeeId = employeeIdSchema.parse(input.employeeId);
  const data = passengerUnlinkSchema.parse({ reason: input.reason });
  await assertLinkManager(input.actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const employee = await tx.employee.findFirst({
      where: { id: employeeId, companyId }, select: { id: true, fullName: true, userId: true },
    });
    if (!employee) throw new PassengerValidationError('Employee not found in this company.');
    if (!employee.userId) throw new PassengerValidationError('This employee record is not linked to a login.');
    await tx.employee.update({ where: { id: employee.id }, data: { userId: null } });
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId, companyId, action: 'EMPLOYEE_ACCOUNT_UNLINKED', entityType: 'EMPLOYEE', entityId: employee.id,
        summary: { employeeName: employee.fullName, userId: employee.userId, reason: data.reason },
      },
    });
    return { employeeId: employee.id, unlinked: true as const };
  });
}
