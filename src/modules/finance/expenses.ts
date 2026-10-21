import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import {
  createExpenseSchema,
  expenseListQuerySchema,
  transitionExpenseSchema,
  updateExpenseSchema,
} from './expense-schema';
import { allowedExpenseTargets, isAllowedExpenseTransition } from './expense-transitions';

export class ExpenseCompanyNotFoundError extends Error {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() { super('Company not found.'); this.name = 'ExpenseCompanyNotFoundError'; }
}
export class ExpenseNotFoundError extends Error {
  readonly code = 'EXPENSE_NOT_FOUND';
  constructor() { super('Expense not found.'); this.name = 'ExpenseNotFoundError'; }
}
export class ExpensePolicyError extends Error {
  readonly code = 'EXPENSE_POLICY';
  readonly statusCode = 422;
  constructor(message: string) { super(message); this.name = 'ExpensePolicyError'; }
}
export class ExpenseTransitionNotAllowedError extends Error {
  readonly code = 'EXPENSE_TRANSITION_NOT_ALLOWED';
  readonly statusCode = 409;
  constructor(fromStatus: string, toStatus: string) {
    super(`An expense cannot move from ${fromStatus} to ${toStatus}.`);
    this.name = 'ExpenseTransitionNotAllowedError';
  }
}

const READ_SCOPES = ['GLOBAL', 'COMPANY', 'READ_ONLY'] as const;
const WRITE_SCOPES = ['GLOBAL', 'COMPANY'] as const;

async function requireExpenseAccess(actorId: string, companyId: string, scopes: readonly string[]) {
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'expense:manage' });
  if (!access.allowed || !access.scopes.some((scope) => scopes.includes(scope))) {
    throw new PermissionDeniedError();
  }
}

type ExpenseStore = Pick<Prisma.TransactionClient, 'expense' | 'expenseStatusHistory' | 'vehicle' | 'trip' | 'company'>;

async function assertLinksExist(
  store: ExpenseStore, companyId: string, vehicleId: string | null, tripId: string | null,
) {
  if (vehicleId) {
    const vehicle = await store.vehicle.findFirst({ where: { id: vehicleId, companyId }, select: { id: true } });
    if (!vehicle) throw new ExpenseNotFoundError();
  }
  if (tripId) {
    const trip = await store.trip.findFirst({ where: { id: tripId, companyId }, select: { id: true } });
    if (!trip) throw new ExpenseNotFoundError();
  }
}

export type ExpenseRecord = {
  id: string;
  reference: string;
  expenseDate: string;
  category: string;
  description: string;
  supplier: string | null;
  method: string | null;
  receiptReference: string | null;
  amountPesewas: number;
  vehicleId: string | null;
  tripId: string | null;
  status: string;
  recordedById: string;
  createdAt: string;
  statusHistory: Array<{
    sequence: number; fromStatus: string | null; toStatus: string;
    reason: string; createdAt: string; actorName: string;
  }>;
};

type ExpenseRow = Omit<ExpenseRecord, 'expenseDate' | 'createdAt' | 'statusHistory'> & {
  expenseDate: Date;
  createdAt: Date;
  statusHistory: Array<Omit<ExpenseRecord['statusHistory'][number], 'createdAt' | 'actorName'> & {
    createdAt: Date; actor: { name: string };
  }>;
};

function toRecord(row: ExpenseRow, auditOnly = true): ExpenseRecord {
  void auditOnly;
  return {
    ...row,
    expenseDate: row.expenseDate.toISOString().slice(0, 10),
    createdAt: row.createdAt.toISOString(),
    statusHistory: row.statusHistory.map(({ actor, ...event }) => ({
      ...event, createdAt: event.createdAt.toISOString(), actorName: actor.name,
    })),
  };
}

const expenseInclude = {
  statusHistory: {
    orderBy: { sequence: 'asc' as const }, take: 50,
    include: { actor: { select: { name: true } } },
  },
};

/** FIN-05 (D-081): record an expense as Pending, awaiting independent approval. */
export async function createExpense(input: unknown): Promise<ExpenseRecord> {
  const data = createExpenseSchema.parse(input);
  await requireExpenseAccess(data.actorId, data.companyId, WRITE_SCOPES);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: data.companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new ExpenseCompanyNotFoundError();
    const store = tx as unknown as ExpenseStore;
    await assertLinksExist(store, data.companyId, data.vehicleId ?? null, data.tripId ?? null);
    const reference = `EXP-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const expense = await tx.expense.create({
      data: {
        companyId: data.companyId,
        reference,
        expenseDate: new Date(`${data.expenseDate}T00:00:00.000Z`),
        category: data.category,
        description: data.description,
        supplier: data.supplier?.trim() || null,
        method: data.method?.trim() || null,
        receiptReference: data.receiptReference?.trim() || null,
        amountPesewas: data.amountPesewas,
        vehicleId: data.vehicleId ?? null,
        tripId: data.tripId ?? null,
        status: 'Pending',
        recordedById: data.actorId,
      },
      include: expenseInclude,
    });
    await tx.expenseStatusHistory.create({
      data: {
        companyId: data.companyId, expenseId: expense.id, sequence: 1,
        actorId: data.actorId, fromStatus: null, toStatus: 'Pending', reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId,
        action: 'EXPENSE_RECORDED', entityType: 'EXPENSE', entityId: expense.id,
        summary: {
          reference, category: data.category, amountPesewas: data.amountPesewas,
          expenseDate: data.expenseDate, vehicleId: data.vehicleId ?? null, tripId: data.tripId ?? null,
          reason: data.reason,
        },
      },
    });
    return toRecord(expense as unknown as ExpenseRow);
  });
}

/** Edits are allowed only while the expense is Pending (D-081). */
export async function updatePendingExpense(input: unknown): Promise<ExpenseRecord> {
  const data = updateExpenseSchema.parse(input);
  await requireExpenseAccess(data.actorId, data.companyId, WRITE_SCOPES);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: data.companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new ExpenseCompanyNotFoundError();
    const store = tx as unknown as ExpenseStore;
    const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT "id", "status" FROM "Expense"
      WHERE "id" = ${data.expenseId} AND "companyId" = ${data.companyId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) throw new ExpenseNotFoundError();
    if (current.status !== 'Pending') {
      throw new ExpensePolicyError('Only a Pending expense can be edited; decided expenses are corrected with a compensating record.');
    }
    await assertLinksExist(
      store, data.companyId,
      data.vehicleId === undefined ? null : data.vehicleId,
      data.tripId === undefined ? null : data.tripId,
    );
    const updated = await tx.expense.update({
      where: { id: data.expenseId },
      data: {
        ...(data.expenseDate !== undefined ? { expenseDate: new Date(`${data.expenseDate}T00:00:00.000Z`) } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.supplier !== undefined ? { supplier: data.supplier?.trim() || null } : {}),
        ...(data.method !== undefined ? { method: data.method?.trim() || null } : {}),
        ...(data.receiptReference !== undefined ? { receiptReference: data.receiptReference?.trim() || null } : {}),
        ...(data.amountPesewas !== undefined ? { amountPesewas: data.amountPesewas } : {}),
        ...(data.vehicleId !== undefined ? { vehicleId: data.vehicleId } : {}),
        ...(data.tripId !== undefined ? { tripId: data.tripId } : {}),
      },
      include: expenseInclude,
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId,
        action: 'EXPENSE_UPDATED', entityType: 'EXPENSE', entityId: data.expenseId,
        summary: { changedFields: Object.keys(data).filter((key) => !['actorId', 'companyId', 'expenseId', 'reason'].includes(key)), reason: data.reason },
      },
    });
    return toRecord(updated as unknown as ExpenseRow);
  });
}

/**
 * The only status-change path (D-081). The decider must differ from the
 * recorder; every decision is written to the sequenced history and the
 * audit log inside the same transaction.
 */
export async function transitionExpense(input: unknown) {
  const data = transitionExpenseSchema.parse(input);
  await requireExpenseAccess(data.actorId, data.companyId, WRITE_SCOPES);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { id: data.companyId }, select: { status: true } });
    if (company?.status !== 'ACTIVE') throw new ExpenseCompanyNotFoundError();
    const locked = await tx.$queryRaw<Array<{ id: string; status: string; recordedById: string; reference: string }>>`
      SELECT "id", "status", "recordedById", "reference" FROM "Expense"
      WHERE "id" = ${data.expenseId} AND "companyId" = ${data.companyId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current) throw new ExpenseNotFoundError();
    if (!isAllowedExpenseTransition(current.status, data.toStatus)) {
      throw new ExpenseTransitionNotAllowedError(current.status, data.toStatus);
    }
    if (data.actorId === current.recordedById) {
      throw new ExpensePolicyError('A different authorised user must decide an expense than the person who recorded it.');
    }
    const latest = await tx.expenseStatusHistory.findFirst({
      where: { companyId: data.companyId, expenseId: data.expenseId },
      orderBy: { sequence: 'desc' }, select: { sequence: true },
    });
    await tx.expense.update({
      where: { id: data.expenseId },
      data: { status: data.toStatus },
    });
    await tx.expenseStatusHistory.create({
      data: {
        companyId: data.companyId, expenseId: data.expenseId, sequence: (latest?.sequence ?? 0) + 1,
        actorId: data.actorId, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId,
        action: data.toStatus === 'Approved' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
        entityType: 'EXPENSE', entityId: data.expenseId,
        summary: { reference: current.reference, fromStatus: current.status, toStatus: data.toStatus, reason: data.reason },
      },
    });
    return { id: data.expenseId, reference: current.reference, fromStatus: current.status, status: data.toStatus };
  });
}

export async function listExpenses(input: {
  actorId: string; companyId: string;
} & Record<string, unknown>) {
  await requireExpenseAccess(input.actorId, input.companyId, READ_SCOPES);
  const query = expenseListQuerySchema.parse(input);
  const prisma = getPrisma();
  const rows = await prisma.expense.findMany({
    where: {
      companyId: input.companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.fromDate || query.toDate ? {
        expenseDate: {
          ...(query.fromDate ? { gte: new Date(`${query.fromDate}T00:00:00.000Z`) } : {}),
          ...(query.toDate ? { lte: new Date(`${query.toDate}T00:00:00.000Z`) } : {}),
        },
      } : {}),
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    take: query.limit ?? 100,
    include: expenseInclude,
  });
  return { expenses: rows.map((row) => toRecord(row as unknown as ExpenseRow)) };
}

export { allowedExpenseTargets };
