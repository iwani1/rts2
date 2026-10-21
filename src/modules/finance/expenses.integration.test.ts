import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignRole } from '@/modules/auth/permissions';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import {
  ExpensePolicyError,
  ExpenseTransitionNotAllowedError,
  createExpense,
  listExpenses,
  transitionExpense,
  updatePendingExpense,
} from './expenses';

const prisma = getPrisma();
let companyId = '';
let recorderId = '';
let approverId = '';
let readerId = '';
let vehicleId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

describe('FIN-05 expenses with PostgreSQL (D-081)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, admin, recorder, approver, reader] = await Promise.all([
      prisma.company.create({ data: { name: `Expenses ${randomUUID()}` } }),
      makeUser('Expense test admin'),
      makeUser('Expense recorder'),
      makeUser('Expense approver'),
      makeUser('Expense reader'),
    ]);
    companyId = company.id;
    recorderId = recorder.id;
    approverId = approver.id;
    readerId = reader.id;
    await prisma.userRoleAssignment.create({
      data: { userId: admin.id, roleCode: 'SUPER_ADMIN', assignedById: admin.id, reason: 'Expense integration administrator' },
    });
    for (const [user, roleCode] of [[recorder, 'FINANCE_OFFICER'], [approver, 'FINANCE_OFFICER'], [reader, 'OPS_MANAGER']] as const) {
      await assignRole({
        actorId: admin.id, targetUserId: user.id, companyId, roleCode, reason: 'Expense integration role',
      });
    }
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `EXP-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Test', model: 'Bus', category: 'Integration fixture',
      },
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('records as Pending with a generated reference and sequenced history', async () => {
    const expense = await createExpense({
      actorId: recorderId, companyId, expenseDate: '2026-10-20', category: 'FUEL',
      description: 'Diesel for Accra shuttle', supplier: 'Station', method: 'MoMo',
      amountPesewas: 120000, vehicleId, reason: 'Fuel purchased for the week',
    });
    expect(expense.status).toBe('Pending');
    expect(expense.reference).toMatch(/^EXP-[A-F0-9]{16}$/);
    expect(expense.statusHistory).toHaveLength(1);
    expect(expense.statusHistory[0]).toMatchObject({ sequence: 1, fromStatus: null, toStatus: 'Pending' });
  });

  it('refuses self-decision and allows a different authorised user to approve', async () => {
    const expense = await createExpense({
      actorId: recorderId, companyId, expenseDate: '2026-10-20', category: 'TOLLS',
      description: 'Motorway tolls', amountPesewas: 4500, reason: 'Toll receipts attached at office',
    });
    await expect(transitionExpense({
      actorId: recorderId, companyId, expenseId: expense.id, toStatus: 'Approved', reason: 'Approving my own expense',
    })).rejects.toBeInstanceOf(ExpensePolicyError);
    const decided = await transitionExpense({
      actorId: approverId, companyId, expenseId: expense.id, toStatus: 'Approved', reason: 'Receipts reviewed and matched',
    });
    expect(decided.status).toBe('Approved');
    const listed = await listExpenses({ actorId: approverId, companyId, status: 'Approved' });
    const found = listed.expenses.find((row) => row.id === expense.id);
    expect(found?.statusHistory.map((event) => event.toStatus)).toEqual(['Pending', 'Approved']);
  });

  it('treats decided expenses as terminal and immutable to edits', async () => {
    const expense = await createExpense({
      actorId: recorderId, companyId, expenseDate: '2026-10-21', category: 'OTHER',
      description: 'Terminal behaviour fixture', amountPesewas: 900, reason: 'Fixture for terminal checks',
    });
    await transitionExpense({
      actorId: approverId, companyId, expenseId: expense.id, toStatus: 'Rejected', reason: 'Not an allowable cost',
    });
    await expect(transitionExpense({
      actorId: approverId, companyId, expenseId: expense.id, toStatus: 'Approved', reason: 'Trying to flip decision',
    })).rejects.toBeInstanceOf(ExpenseTransitionNotAllowedError);
    await expect(updatePendingExpense({
      actorId: recorderId, companyId, expenseId: expense.id, amountPesewas: 1, reason: 'Trying to edit a decision',
    })).rejects.toBeInstanceOf(ExpensePolicyError);
  });

  it('allows editing while Pending and keeps read-only readers out of writes', async () => {
    const expense = await createExpense({
      actorId: recorderId, companyId, expenseDate: '2026-10-21', category: 'TYRES',
      description: 'One tyre replacement', amountPesewas: 80000, reason: 'Tyre worn beyond limit',
    });
    const updated = await updatePendingExpense({
      actorId: recorderId, companyId, expenseId: expense.id, amountPesewas: 85000, reason: 'Supplier price was higher',
    });
    expect(updated.amountPesewas).toBe(85000);
    await expect(createExpense({
      actorId: readerId, companyId, expenseDate: '2026-10-21', category: 'FUEL',
      description: 'Reader should not record', amountPesewas: 100, reason: 'Read-only role attempt',
    })).rejects.toBeInstanceOf(PermissionDeniedError);
    const visible = await listExpenses({ actorId: readerId, companyId });
    expect(visible.expenses.length).toBeGreaterThan(0);
  });

  it('keeps history rows immutable at the database', async () => {
    const expense = await createExpense({
      actorId: recorderId, companyId, expenseDate: '2026-10-21', category: 'REPAIRS',
      description: 'Brake pad replacement', amountPesewas: 25000, reason: 'Brakes below threshold',
    });
    await expect(prisma.$executeRaw`
      UPDATE "ExpenseStatusHistory" SET "reason" = 'rewritten' WHERE "expenseId" = ${expense.id}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      DELETE FROM "ExpenseStatusHistory" WHERE "expenseId" = ${expense.id}
    `).rejects.toThrow();
  });
});
