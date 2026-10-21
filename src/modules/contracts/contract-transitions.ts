export const CONTRACT_STATUSES = ['Draft', 'Pending Approval', 'Active', 'Suspended', 'Expired', 'Terminated'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/**
 * Contract lifecycle approved in D-049. Every status change goes through
 * `transitionContract`, which checks this table, the actor's permission and
 * the transition preconditions, then writes a ContractStatusHistory row.
 * `Terminated` is terminal. An Expired contract returns to Active only as a
 * renewal with a new future end date — never by silently reactivating it.
 */
export const contractTransitions: ReadonlyArray<{ from: ContractStatus; to: ContractStatus }> = [
  { from: 'Draft', to: 'Pending Approval' },
  { from: 'Pending Approval', to: 'Active' },
  { from: 'Pending Approval', to: 'Draft' },
  { from: 'Active', to: 'Suspended' },
  { from: 'Active', to: 'Expired' },
  { from: 'Active', to: 'Terminated' },
  { from: 'Suspended', to: 'Active' },
  { from: 'Suspended', to: 'Expired' },
  { from: 'Suspended', to: 'Terminated' },
  { from: 'Expired', to: 'Active' },
];

export function isAllowedContractTransition(from: string, to: string): boolean {
  return contractTransitions.some((transition) => transition.from === from && transition.to === to);
}

export function allowedContractTargets(from: string): ContractStatus[] {
  return contractTransitions.filter((transition) => transition.from === from).map((transition) => transition.to);
}
