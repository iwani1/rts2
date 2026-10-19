import type { RentalRequestRecord } from '@/modules/rentals/rental-requests';

function value(text: string | number | null | undefined) {
  return text === null || text === undefined || text === '' ? 'Not recorded' : String(text);
}

function DetailsGroup({ title, entries }: { title: string; entries: Array<[string, string | number | null | undefined]> }) {
  return <section className="rental-request-detail-group" aria-label={title}>
    <h3>{title}</h3>
    <dl>{entries.map(([label, entry]) => <div key={label}><dt>{label}</dt><dd>{value(entry)}</dd></div>)}</dl>
  </section>;
}

export function RentalRequestDetails({ request }: { request: RentalRequestRecord }) {
  return <section className="vehicle-editor rental-request-details" aria-labelledby="request-details-title">
    <div className="vehicle-editor-heading"><div><p className="eyebrow">Submitted request</p><h2 id="request-details-title">Request details</h2></div></div>
    <DetailsGroup title="Customer and journey" entries={[
      ['Customer', request.customerName], ['Request status', request.status], ['Service date', request.serviceDate],
      ['Departure time', request.departureTime], ['Return date', request.returnDate ?? 'Not separately recorded'],
      ['Return time', request.returnTime], ['Duration (minutes)', request.durationMinutes],
      ['Pickup location', request.pickupLocation], ['Destination', request.destination], ['Intermediate stops', request.intermediateStops],
    ]} />
    <DetailsGroup title="Trip requirements" entries={[
      ['Passenger count', request.passengerCount], ['Luggage or special needs', request.luggageSpecialNeeds],
      ['Purpose', request.purpose], ['Requested vehicle type', request.requestedVehicleType], ['Driver requirement', request.driverRequirement],
      ['Request source', request.requestSource],
    ]} />
    <DetailsGroup title="Contact and notes" entries={[
      ['Trip contact name', request.tripContactName], ['Trip contact telephone', request.tripContactTelephone],
      ['Trip contact email', request.tripContactEmail], ['Request notes', request.notes],
    ]} />
    <p className="form-help">These are the saved request values. Missing values are shown as “Not recorded”; no date or return time is inferred.</p>
  </section>;
}
