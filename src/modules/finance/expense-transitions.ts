export const EXPENSE_STATUSES = ['Pending', 'Approved', 'Rejected'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export const EXPENSE_CATEGORIES = ['FUEL', 'MAINTENANCE', 'REPAIRS', 'TYRES', 'TOLLS', 'OTHER'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Expense approval lifecycle approved in D-081. Every status change goes
 * through `transitionExpense`, which checks this table, the actor's
 * permission, the independent-review rule (decider != recorder) and the
 * reason, then writes an ExpenseStatusHistory row. `Approved` and
 * `Rejected` are terminal; corrections after a decision are made with a
 * compensating record, never by rewriting (brief §5.4).
 */
export const expenseTransitions: ReadonlyArray<{ from: ExpenseStatus; to: ExpenseStatus }> = [
  { from: 'Pending', to: 'Approved' },
  { from: 'Pending', to: 'Rejected' },
];

export function isAllowedExpenseTransition(from: string, to: string): boolean {
  return expenseTransitions.some((transition) => transition.from === from && transition.to === to);
}

export function allowedExpenseTargets(from: string): ExpenseStatus[] {
  return expenseTransitions
    .filter((transition) => transition.from === from)
    .map((transition) => transition.to);
}
