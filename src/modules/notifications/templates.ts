/**
 * NTF-01 (D-068) notification wording. Templates live in a code-side registry
 * with recipient-friendly language. Admin-editable template text is deferred
 * (no settings keys exist yet) and is not claimed as configurable in the UI.
 */

export type NotificationContent = { title: string; body: string };

function journeyTypeLabel(bookingType: string): string {
  return bookingType === 'HOME_TO_OFFICE' ? 'home to office' : 'office to home';
}

export function bookingCreatedNotification(booking: {
  reference: string; journeyDate: string; bookingType: string;
}): NotificationContent {
  return {
    title: `Journey requested (${booking.reference})`,
    body: `A ${journeyTypeLabel(booking.bookingType)} journey on ${booking.journeyDate} has been requested for you. We will confirm it shortly.`,
  };
}

export function bookingStatusNotification(
  booking: { reference: string; journeyDate: string; bookingType: string },
  toStatus: string,
): NotificationContent {
  const journey = `${journeyTypeLabel(booking.bookingType)} journey ${booking.reference} on ${booking.journeyDate}`;
  switch (toStatus) {
    case 'Accepted':
      return { title: `Journey confirmed (${booking.reference})`, body: `Your ${journey} is confirmed.` };
    case 'Rejected':
      return {
        title: `Journey not confirmed (${booking.reference})`,
        body: `We could not confirm your ${journey}. Please contact operations if you still need to travel.`,
      };
    case 'Cancelled':
      return { title: `Journey cancelled (${booking.reference})`, body: `Your ${journey} has been cancelled.` };
    default:
      return { title: `Journey update (${booking.reference})`, body: `Your ${journey} is now ${toStatus}.` };
  }
}

export function bookingAssignedNotification(
  booking: { reference: string; journeyDate: string; bookingType: string },
  tripReference: string,
): NotificationContent {
  return {
    title: `Bus assigned (${booking.reference})`,
    body: `Your ${journeyTypeLabel(booking.bookingType)} journey ${booking.reference} on ${booking.journeyDate} has been assigned to trip ${tripReference}. See My transport for pickup details.`,
  };
}

export function rentalQuotationIssuedNotification(
  quotation: { reference: string; totalPesewas: number; expiresAt: Date },
): NotificationContent {
  const total = `GH₵ ${(quotation.totalPesewas / 100).toFixed(2)}`;
  const expiry = quotation.expiresAt.toISOString().slice(0, 10);
  return {
    title: 'Your rental quotation is ready',
    body: `Quotation ${quotation.reference} totals ${total} and is valid until ${expiry}. Sign in to your portal to accept or decline it.`,
  };
}

export function rentalStatusNotification(
  request: { pickupLocation: string | null; destination: string | null; serviceDate: string | null },
  toStatus: string,
): NotificationContent {
  const route = `${request.pickupLocation ?? 'your pickup'} to ${request.destination ?? 'your destination'}`;
  const when = request.serviceDate ? ` on ${request.serviceDate}` : '';
  switch (toStatus) {
    case 'Under Review':
      return {
        title: 'Rental request under review',
        body: `Our team is reviewing your rental request (${route}${when}). We will be in touch with next steps.`,
      };
    case 'Confirmed':
      return {
        title: 'Rental booking confirmed',
        body: `Your rental booking (${route}${when}) is confirmed and your vehicle is reserved. We will share driver details when assigned.`,
      };
    case 'Assigned':
      return {
        title: 'Driver assigned to your rental',
        body: `A driver has been assigned to your rental (${route}${when}).`,
      };
    case 'Completed':
      return {
        title: 'Rental completed',
        body: `Your rental (${route}${when}) is complete. Thank you for travelling with us.`,
      };
    case 'Cancelled':
      return {
        title: 'Rental booking cancelled',
        body: `Your rental booking (${route}${when}) has been cancelled. Please contact us if you need anything else.`,
      };
    case 'Declined':
      return {
        title: 'Rental request declined',
        body: `We are unable to take on your rental request (${route}${when}). Please contact us and we will help you find an alternative.`,
      };
    default:
      return { title: 'Rental request update', body: `Your rental request (${route}${when}) is now ${toStatus}.` };
  }
}
