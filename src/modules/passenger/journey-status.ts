export const PASSENGER_JOURNEY_STATUSES = [
  'Requested',
  'Confirmed',
  'Assigned to trip',
  'Driver en route',
  'Delayed',
  'Picked up',
  'Completed',
  'Cancelled',
] as const;

export type PassengerJourneyStatus = (typeof PASSENGER_JOURNEY_STATUSES)[number];

/**
 * PAX-01 (D-065): maps internal booking + trip states onto the passenger
 * vocabulary from the standing brief. A live map or ETA is never implied —
 * "Driver en route" means only that the trip has been dispatched or started
 * (PAX-02 live updates are Phase 2). Boarded passengers stay "Picked up" even
 * if the trip later reports a delay.
 */
export function passengerJourneyStatus(
  bookingStatus: string, tripStatus: string | null,
): PassengerJourneyStatus {
  if (bookingStatus === 'Cancelled' || bookingStatus === 'Rejected') return 'Cancelled';
  if (bookingStatus === 'Completed') return 'Completed';
  if (bookingStatus === 'Boarded') return 'Picked up';
  if (bookingStatus === 'Assigned') {
    if (tripStatus === 'Delayed') return 'Delayed';
    if (tripStatus === 'Dispatched' || tripStatus === 'In Progress') return 'Driver en route';
    return 'Assigned to trip';
  }
  if (bookingStatus === 'Accepted') return 'Confirmed';
  return 'Requested';
}
