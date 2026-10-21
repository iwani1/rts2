export const RENTAL_QUOTATION_STATUSES = ['ISSUED', 'ACCEPTED', 'DECLINED', 'SUPERSEDED'] as const;
export type RentalQuotationStatus = (typeof RENTAL_QUOTATION_STATUSES)[number];

/**
 * Quotation state machine (D-090/5B). A live (ISSUED) quotation is accepted
 * or declined by the customer, or superseded when staff issue a fresh one.
 * Expiry is derived from `expiresAt` in presentation and decision guards;
 * it is never a stored transition. Every change flows through the guarded
 * service writes in rental-quotations.ts.
 */
export const rentalQuotationTransitions: ReadonlyArray<{ from: RentalQuotationStatus; to: RentalQuotationStatus }> = [
  { from: 'ISSUED', to: 'ACCEPTED' },
  { from: 'ISSUED', to: 'DECLINED' },
  { from: 'ISSUED', to: 'SUPERSEDED' },
];

export function isAllowedRentalQuotationTransition(from: string, to: string): boolean {
  return rentalQuotationTransitions.some((transition) => transition.from === from && transition.to === to);
}
