export const rentalRequestTransitions = [
  { from: 'Submitted', to: 'Under Review' },
  { from: 'Under Review', to: 'Declined' },
] as const;

export type RentalRequestTransition = (typeof rentalRequestTransitions)[number];
export type RentalRequestTransitionTarget = RentalRequestTransition['to'];

export function isAllowedRentalRequestTransition(from: string, to: string): boolean {
  return rentalRequestTransitions.some((transition) => transition.from === from && transition.to === to);
}
