export const RECONCILIATION_STATUSES = ['OPEN', 'CLOSED'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

/**
 * FIN-08 / D-085: a reconciliation run is OPEN while being investigated and
 * CLOSED once signed off. The single transition function checks this table,
 * the permission and the independent-sign-off rule, then writes history.
 */
export const reconciliationTransitions: ReadonlyArray<{ from: ReconciliationStatus; to: ReconciliationStatus }> = [
  { from: 'OPEN', to: 'CLOSED' },
];

export function isAllowedReconciliationTransition(from: string, to: string): boolean {
  return reconciliationTransitions.some((transition) => transition.from === from && transition.to === to);
}
