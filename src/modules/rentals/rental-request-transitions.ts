/**
 * The single rental-request transition matrix. D-032 approved
 * Submitted -> Under Review -> Declined; D-089 (Phase 4) activates
 * confirmation (RNT-05), driver assignment (RNT-06), completion (RNT-07)
 * and pre-trip cancellation (RNT-08). Every change still flows through a
 * guarded service write that checks this table, writes a
 * RentalRequestStatusHistory row and an audit event.
 */
export const rentalRequestTransitions = [
  { from: 'Submitted', to: 'Under Review' },
  { from: 'Under Review', to: 'Declined' },
  { from: 'Under Review', to: 'Confirmed' },
  { from: 'Confirmed', to: 'Assigned' },
  { from: 'Confirmed', to: 'Completed' },
  { from: 'Assigned', to: 'Completed' },
  { from: 'Confirmed', to: 'Cancelled' },
  { from: 'Assigned', to: 'Cancelled' },
] as const;

export type RentalRequestTransition = (typeof rentalRequestTransitions)[number];
export type RentalRequestTransitionTarget = RentalRequestTransition['to'];

export function isAllowedRentalRequestTransition(from: string, to: string): boolean {
  return rentalRequestTransitions.some((transition) => transition.from === from && transition.to === to);
}
