export const TRIP_STATUSES = [
  'Planned', 'Ready for Dispatch', 'Dispatched', 'In Progress', 'Delayed', 'Completed', 'Cancelled', 'Interrupted',
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/**
 * Trip lifecycle (D-053), matching docs/STATE_MACHINES.md. Every change goes
 * through the trip transition function (row lock, permission, preconditions,
 * sequenced history, audit) and is mirrored by database guards. Completed
 * and Cancelled are terminal.
 */
export const tripTransitions: ReadonlyArray<{ from: TripStatus; to: TripStatus }> = [
  { from: 'Planned', to: 'Ready for Dispatch' },
  { from: 'Planned', to: 'Cancelled' },
  { from: 'Ready for Dispatch', to: 'Dispatched' },
  { from: 'Ready for Dispatch', to: 'Cancelled' },
  { from: 'Ready for Dispatch', to: 'Planned' },
  { from: 'Dispatched', to: 'In Progress' },
  { from: 'Dispatched', to: 'Delayed' },
  { from: 'Dispatched', to: 'Interrupted' },
  { from: 'In Progress', to: 'Delayed' },
  { from: 'In Progress', to: 'Interrupted' },
  { from: 'In Progress', to: 'Completed' },
  { from: 'Delayed', to: 'In Progress' },
  { from: 'Delayed', to: 'Completed' },
  { from: 'Delayed', to: 'Interrupted' },
  { from: 'Interrupted', to: 'In Progress' },
  { from: 'Interrupted', to: 'Completed' },
  { from: 'Interrupted', to: 'Cancelled' },
];

export function isAllowedTripTransition(from: string, to: string): boolean {
  return tripTransitions.some((transition) => transition.from === from && transition.to === to);
}

export function allowedTripTargets(from: string): TripStatus[] {
  return tripTransitions.filter((transition) => transition.from === from).map((transition) => transition.to);
}
