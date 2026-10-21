export const BOOKING_STATUSES = ['Pending', 'Accepted', 'Rejected', 'Assigned', 'Boarded', 'Completed', 'Cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_TYPES = [
  'HOME_TO_OFFICE', 'OFFICE_TO_HOME', 'ONE_TIME', 'RECURRING', 'AD_HOC', 'EMERGENCY', 'RETURN', 'ADDITIONAL_DESTINATION',
] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

/**
 * Booking lifecycle (D-052). Staff/HR bookings enter at Pending (the Draft
 * stage is reserved for the future passenger portal). Assignment, boarding
 * and completion are driven by the trip/dispatch/driver flows, not by this
 * generic transition path. Rejected, Completed and Cancelled are terminal.
 */
export const bookingTransitions: ReadonlyArray<{ from: BookingStatus; to: BookingStatus }> = [
  { from: 'Pending', to: 'Accepted' },
  { from: 'Pending', to: 'Rejected' },
  { from: 'Pending', to: 'Cancelled' },
  { from: 'Accepted', to: 'Assigned' },
  { from: 'Accepted', to: 'Cancelled' },
  { from: 'Assigned', to: 'Boarded' },
  { from: 'Assigned', to: 'Cancelled' },
  { from: 'Assigned', to: 'Accepted' },
  { from: 'Boarded', to: 'Completed' },
];

export function isAllowedBookingTransition(from: string, to: string): boolean {
  return bookingTransitions.some((transition) => transition.from === from && transition.to === to);
}

export function allowedBookingTargets(from: string): BookingStatus[] {
  return bookingTransitions.filter((transition) => transition.from === from).map((transition) => transition.to);
}
