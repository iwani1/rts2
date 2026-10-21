export const CORPORATE_INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const;
export type CorporateInvoiceStatus = (typeof CORPORATE_INVOICE_STATUSES)[number];

/**
 * Invoice lifecycle approved in D-061. Every status change goes through
 * `transitionCorporateInvoice`, which checks this table, the actor's
 * permission and the transition preconditions, then writes a
 * CorporateInvoiceStatusHistory row. `PAID` is also reached automatically
 * when recorded payments cover the total (see recordInvoicePayment).
 * `PAID` and `VOID` are terminal.
 */
export const corporateInvoiceTransitions: ReadonlyArray<{ from: CorporateInvoiceStatus; to: CorporateInvoiceStatus }> = [
  { from: 'DRAFT', to: 'ISSUED' },
  { from: 'DRAFT', to: 'VOID' },
  { from: 'ISSUED', to: 'PAID' },
  { from: 'ISSUED', to: 'VOID' },
];

export function isAllowedCorporateInvoiceTransition(from: string, to: string): boolean {
  return corporateInvoiceTransitions.some((transition) => transition.from === from && transition.to === to);
}

export function allowedCorporateInvoiceTargets(from: string): CorporateInvoiceStatus[] {
  return corporateInvoiceTransitions
    .filter((transition) => transition.from === from)
    .map((transition) => transition.to);
}
