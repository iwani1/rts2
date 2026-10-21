import { describe, expect, it } from 'vitest';
import {
  EXPENSE_STATUSES,
  allowedExpenseTargets,
  isAllowedExpenseTransition,
} from './expense-transitions';
import { createExpenseSchema, transitionExpenseSchema } from './expense-schema';

describe('expense transition matrix (D-081)', () => {
  const allowed = new Set(['Pending>Approved', 'Pending>Rejected']);
  for (const from of EXPENSE_STATUSES) {
    for (const to of EXPENSE_STATUSES) {
      it(`${from} -> ${to}`, () => {
        expect(isAllowedExpenseTransition(from, to)).toBe(allowed.has(`${from}>${to}`));
      });
    }
  }

  it('decided expenses are terminal', () => {
    expect(allowedExpenseTargets('Approved')).toEqual([]);
    expect(allowedExpenseTargets('Rejected')).toEqual([]);
  });
});

describe('expense schemas (D-081)', () => {
  it('requires a positive whole-pesewas amount and a category', () => {
    const base = {
      actorId: 'user-1', companyId: 'company-1', expenseDate: '2026-10-21',
      category: 'FUEL', description: 'Diesel for route GHA-12', amountPesewas: 45000,
      reason: 'Fuel purchased at station',
    };
    expect(createExpenseSchema.safeParse(base).success).toBe(true);
    expect(createExpenseSchema.safeParse({ ...base, amountPesewas: 0 }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...base, amountPesewas: -5 }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...base, amountPesewas: 10.5 }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...base, category: 'PARKING' }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...base, reason: 'short' }).success).toBe(false);
  });

  it('decisions always carry a reason and an explicit target', () => {
    const base = {
      actorId: 'user-2', companyId: 'company-1', expenseId: 'expense-1',
      toStatus: 'Approved', reason: 'Receipt verified at depot',
    };
    expect(transitionExpenseSchema.safeParse(base).success).toBe(true);
    expect(transitionExpenseSchema.safeParse({ ...base, toStatus: 'Pending' }).success).toBe(false);
    expect(transitionExpenseSchema.safeParse({ ...base, reason: 'ok' }).success).toBe(false);
  });
});
