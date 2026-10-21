export const RENTAL_INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const;
export type RentalInvoiceStatus = (typeof RENTAL_INVOICE_STATUSES)[number];

/**
 * Rental invoice lifecycle (D-090/5A), mirroring the corporate invoice
 * table (D-061): DRAFT -> ISSUED/VOID, ISSUED -> PAID/VOID, with PAID also
 * reached automatically when recorded payments cover the total (see
 * recordRentalInvoicePayment). PAID and VOID are terminal. Every change
 * flows through the guarded service write that checks this table, writes
 * a RentalInvoiceStatusHistory row and an audit event.
 */
export const rentalInvoiceTransitions: ReadonlyArray<{ from: RentalInvoiceStatus; to: RentalInvoiceStatus }> = [
  { from: 'DRAFT', to: 'ISSUED' },
  { from: 'DRAFT', to: 'VOID' },
  { from: 'ISSUED', to: 'PAID' },
  { from: 'ISSUED', to: 'VOID' },
];

export function isAllowedRentalInvoiceTransition(from: string, to: string): boolean {
  return rentalInvoiceTransitions.some((transition) => transition.from === from && transition.to === to);
}

export function allowedRentalInvoiceTargets(from: string): RentalInvoiceStatus[] {
  return rentalInvoiceTransitions
    .filter((transition) => transition.from === from)
    .map((transition) => transition.to);
}
