import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { bindUserClientSchema, corporateDashboardQuerySchema } from './dashboard-schema';

const companyIdSchema = z.string().trim().min(1).max(128);

export class DashboardCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'DashboardCompanyNotFoundError'; }
}
export class ClientBindingNotFoundError extends Error {
  readonly code = 'CLIENT_NOT_BOUND';
  constructor() {
    super('Your login is not bound to a corporate client yet. Ask the operations team to bind it before using the corporate dashboard.');
    this.name = 'ClientBindingNotFoundError';
  }
}
export class DashboardValidationError extends Error {
  readonly code = 'DASHBOARD_VALIDATION';
  constructor(message: string) { super(message); this.name = 'DashboardValidationError'; }
}

async function assertCompany(actorId: string, companyId: string) {
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new DashboardCompanyNotFoundError();
  void actorId;
}

/**
 * D-059: binds a Corporate HR Admin login to exactly one client in the
 * company (audited; one active binding per user enforced by a partial unique
 * index). Only Super Administrator (GLOBAL) or Operations Manager (COMPANY)
 * actors may bind, and only users holding an active CORP_HR_ADMIN assignment
 * in this company can be bound.
 */
export async function bindUserClient(input: unknown, actorId: string, companyIdInput: string) {
  const data = bindUserClientSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'client:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  if (!permission.scopes.includes('GLOBAL') && !permission.scopes.includes('COMPANY')) {
    throw new PermissionDeniedError();
  }
  await assertCompany(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const [user, client, role] = await Promise.all([
      tx.user.findUnique({ where: { id: data.userId }, select: { id: true, status: true, name: true } }),
      tx.client.findFirst({ where: { id: data.clientId, companyId, archivedAt: null }, select: { id: true, name: true } }),
      tx.userRoleAssignment.findFirst({
        where: { userId: data.userId, companyId, roleCode: 'CORP_HR_ADMIN', revokedAt: null },
        select: { id: true },
      }),
    ]);
    if (!user || user.status !== 'ACTIVE') throw new DashboardValidationError('The login account must exist and be active.');
    if (!client) throw new DashboardValidationError('Client not found in this company, or it is archived.');
    if (!role) throw new DashboardValidationError('Only users with an active Corporate HR Admin assignment in this company can be bound to a client.');
    const existing = await tx.userClientBinding.findFirst({
      where: { companyId, userId: data.userId, revokedAt: null },
      select: { id: true, clientId: true },
    });
    if (existing) {
      throw new DashboardValidationError('This user already has an active client binding. Revoke it before binding to another client.');
    }
    const binding = await tx.userClientBinding.create({
      data: { companyId, userId: data.userId, clientId: data.clientId, reason: data.reason, boundById: actorId },
      select: { id: true },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'USER_CLIENT_BOUND', entityType: 'USER_CLIENT_BINDING', entityId: binding.id,
        summary: { userId: data.userId, userName: user.name, clientId: data.clientId, clientName: client.name, reason: data.reason },
      },
    });
    return { bindingId: binding.id, userId: data.userId, clientId: data.clientId };
  });
}

export async function revokeUserClientBinding(input: { actorId: string; companyId: string; bindingId: string; reason: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  const bindingId = z.string().trim().min(1).max(128).parse(input.bindingId);
  const reason = z.string().trim().min(8).max(500).parse(input.reason);
  const permission = await resolvePermission({ userId: input.actorId, companyId, permission: 'client:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  if (!permission.scopes.includes('GLOBAL') && !permission.scopes.includes('COMPANY')) {
    throw new PermissionDeniedError();
  }
  await assertCompany(input.actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const binding = await tx.userClientBinding.findFirst({
      where: { id: bindingId, companyId, revokedAt: null },
      select: { id: true, userId: true, clientId: true },
    });
    if (!binding) throw new DashboardValidationError('Active binding not found.');
    await tx.userClientBinding.update({ where: { id: binding.id }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId, companyId, action: 'USER_CLIENT_BINDING_REVOKED', entityType: 'USER_CLIENT_BINDING', entityId: binding.id,
        summary: { userId: binding.userId, clientId: binding.clientId, reason },
      },
    });
    return { bindingId: binding.id, revoked: true };
  });
}

export type CorporateDashboard = {
  client: { id: string; name: string; contactPerson: string | null; telephone: string | null; email: string | null };
  window: { fromDate: string | null; toDate: string | null };
  bookingCountsByStatus: Array<{ status: string; count: number }>;
  bookings: Array<{
    bookingReference: string; employeeName: string; bookingType: string;
    journeyDate: string; status: string; tripReference: string | null;
  }>;
  employees: Array<{ fullName: string; department: string | null; accountStatus: string | null; transportEligible: boolean | null }>;
  contracts: Array<{ reference: string; status: string; startDate: string | null; endDate: string | null }>;
  invoices: Array<{ reference: string; periodStart: string; periodEnd: string; totalPesewas: number; lineCount: number }>;
  upcomingTrips: Array<{ reference: string; tripDate: string; status: string; passengerCount: number }>;
};

/**
 * CLI-03 read model. Restricted to the caller's bound client (D-059): every
 * query is filtered by that clientId, foreign clients never appear, and
 * restricted employee fields are never projected (name, department, account
 * status, eligibility only). The CORP_HR_ADMIN role alone is not sufficient —
 * an active binding is required.
 */
export async function getCorporateDashboard(input: {
  actorId: string; companyId: string; fromDate?: string; toDate?: string;
}): Promise<CorporateDashboard> {
  const companyId = companyIdSchema.parse(input.companyId);
  const query = corporateDashboardQuerySchema.parse({
    fromDate: input.fromDate || undefined, toDate: input.toDate || undefined,
  });
  await assertCompany(input.actorId, companyId);
  const prisma = getPrisma();
  const binding = await prisma.userClientBinding.findFirst({
    where: { companyId, userId: input.actorId, revokedAt: null },
    select: { clientId: true },
  });
  if (!binding) throw new ClientBindingNotFoundError();
  const client = await prisma.client.findFirst({
    where: { id: binding.clientId, companyId, archivedAt: null },
    select: { id: true, name: true, contactPerson: true, telephone: true, email: true },
  });
  if (!client) throw new ClientBindingNotFoundError();
  const windowFilter = query.fromDate || query.toDate ? {
    gte: query.fromDate ? new Date(`${query.fromDate}T00:00:00.000Z`) : undefined,
    lte: query.toDate ? new Date(`${query.toDate}T00:00:00.000Z`) : undefined,
  } : undefined;
  const [counts, bookings, employees, contracts, invoices, upcomingTrips] = await Promise.all([
    prisma.booking.groupBy({
      by: ['status'],
      where: {
        companyId, clientId: client.id,
        ...(windowFilter ? { journeyDate: windowFilter } : {}),
      },
      _count: { _all: true },
    }),
    prisma.booking.findMany({
      where: {
        companyId, clientId: client.id,
        ...(windowFilter ? { journeyDate: windowFilter } : {}),
      },
      orderBy: [{ journeyDate: 'desc' }, { createdAt: 'desc' }],
      select: {
        reference: true, bookingType: true, journeyDate: true, status: true,
        employee: { select: { fullName: true } },
        trip: { select: { reference: true } },
      },
      take: 100,
    }),
    prisma.employee.findMany({
      where: { companyId, clientId: client.id, archivedAt: null },
      orderBy: { fullName: 'asc' },
      select: { fullName: true, department: true, accountStatus: true, transportEligible: true },
      take: 200,
    }),
    prisma.contract.findMany({
      where: { companyId, clientId: client.id },
      orderBy: { createdAt: 'desc' },
      select: { reference: true, status: true, startDate: true, endDate: true },
      take: 20,
    }),
    prisma.corporateInvoice.findMany({
      where: { companyId, clientId: client.id },
      orderBy: [{ periodStart: 'desc' }, { id: 'desc' }],
      select: {
        reference: true, periodStart: true, periodEnd: true, totalPesewas: true,
        _count: { select: { lines: true } },
      },
      take: 20,
    }),
    prisma.trip.findMany({
      where: {
        companyId, clientId: client.id,
        tripDate: { gte: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z') },
        status: { in: ['Planned', 'Ready for Dispatch', 'Dispatched', 'In Progress', 'Delayed'] },
      },
      orderBy: [{ tripDate: 'asc' }, { id: 'asc' }],
      select: {
        reference: true, tripDate: true, status: true,
        _count: { select: { bookings: { where: { status: { in: ['Assigned', 'Boarded'] } } } } },
      },
      take: 50,
    }),
  ]);
  return {
    client: {
      id: client.id, name: client.name,
      contactPerson: client.contactPerson, telephone: client.telephone, email: client.email,
    },
    window: { fromDate: query.fromDate ?? null, toDate: query.toDate ?? null },
    bookingCountsByStatus: counts.map((row: { status: string; _count: { _all: number } }) => ({
      status: row.status, count: row._count._all,
    })),
    bookings: bookings.map((row: {
      reference: string; bookingType: string; journeyDate: Date; status: string;
      employee: { fullName: string }; trip: { reference: string } | null;
    }) => ({
      bookingReference: row.reference,
      employeeName: row.employee.fullName,
      bookingType: row.bookingType,
      journeyDate: row.journeyDate.toISOString().slice(0, 10),
      status: row.status,
      tripReference: row.trip?.reference ?? null,
    })),
    employees: employees.map((row: {
      fullName: string; department: string | null; accountStatus: string | null; transportEligible: boolean | null;
    }) => ({
      fullName: row.fullName,
      department: row.department,
      accountStatus: row.accountStatus,
      transportEligible: row.transportEligible,
    })),
    contracts: contracts.map((row: {
      reference: string; status: string; startDate: Date | null; endDate: Date | null;
    }) => ({
      reference: row.reference,
      status: row.status,
      startDate: row.startDate ? row.startDate.toISOString().slice(0, 10) : null,
      endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    })),
    invoices: invoices.map((row: {
      reference: string; periodStart: Date; periodEnd: Date; totalPesewas: number; _count: { lines: number };
    }) => ({
      reference: row.reference,
      periodStart: row.periodStart.toISOString().slice(0, 10),
      periodEnd: row.periodEnd.toISOString().slice(0, 10),
      totalPesewas: row.totalPesewas,
      lineCount: row._count.lines,
    })),
    upcomingTrips: upcomingTrips.map((row: {
      reference: string; tripDate: Date; status: string; _count: { bookings: number };
    }) => ({
      reference: row.reference,
      tripDate: row.tripDate.toISOString().slice(0, 10),
      status: row.status,
      passengerCount: row._count.bookings,
    })),
  };
}
