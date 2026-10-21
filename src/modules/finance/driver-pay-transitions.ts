export const PAY_RULE_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export const PAYROLL_RUN_STATUSES = ['OPEN', 'FINAL'] as const;

const ruleTransitions: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'DRAFT', to: 'ACTIVE' },
  { from: 'DRAFT', to: 'RETIRED' },
  { from: 'ACTIVE', to: 'RETIRED' },
];

const runTransitions: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'OPEN', to: 'FINAL' },
];

export function isAllowedPayRuleTransition(from: string, to: string): boolean {
  return ruleTransitions.some((transition) => transition.from === from && transition.to === to);
}

export function isAllowedPayrollRunTransition(from: string, to: string): boolean {
  return runTransitions.some((transition) => transition.from === from && transition.to === to);
}
