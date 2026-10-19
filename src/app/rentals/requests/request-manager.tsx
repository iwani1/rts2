'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RentalRequestRecord } from '@/modules/rentals/rental-requests';
import { CustomerPicker } from './customer-picker';

type RequestFields = Omit<RentalRequestRecord, 'id' | 'customerName' | 'customerArchived' | 'status' | 'createdAt' | 'updatedAt'>;
const emptyRequest: RequestFields = {
  customerId: '', serviceDate: null, departureTime: null, returnTime: null, durationMinutes: null,
  pickupLocation: null, destination: null, intermediateStops: null, passengerCount: null,
  luggageSpecialNeeds: null, purpose: null, requestedVehicleType: null, driverRequirement: null,
  tripContactName: null, tripContactTelephone: null, tripContactEmail: null, notes: null, requestSource: null,
};

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

function draftPayload(form: FormData) {
  const duration = value(form, 'durationMinutes');
  const passengerCount = value(form, 'passengerCount');
  return {
    customerId: value(form, 'customerId'),
    serviceDate: value(form, 'serviceDate') || null,
    departureTime: value(form, 'departureTime') || null,
    returnTime: value(form, 'returnTime') || null,
    durationMinutes: duration ? Number(duration) : null,
    pickupLocation: value(form, 'pickupLocation') || null,
    destination: value(form, 'destination') || null,
    intermediateStops: value(form, 'intermediateStops') || null,
    passengerCount: passengerCount ? Number(passengerCount) : null,
    luggageSpecialNeeds: value(form, 'luggageSpecialNeeds') || null,
    purpose: value(form, 'purpose') || null,
    requestedVehicleType: value(form, 'requestedVehicleType') || null,
    driverRequirement: value(form, 'driverRequirement') || null,
    tripContactName: value(form, 'tripContactName') || null,
    tripContactTelephone: value(form, 'tripContactTelephone') || null,
    tripContactEmail: value(form, 'tripContactEmail') || null,
    notes: value(form, 'notes') || null,
    requestSource: value(form, 'requestSource') || null,
    reason: value(form, 'reason'),
  };
}

export function RequestManager({ companyId, request }: { companyId: string; request?: RentalRequestRecord }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pickerResetKey, setPickerResetKey] = useState(0);
  const [reason, setReason] = useState('');
  const requestForm = useRef<HTMLFormElement>(null);
  const fields: RequestFields = request ? {
    customerId: request.customerId,
    serviceDate: request.serviceDate,
    departureTime: request.departureTime,
    returnTime: request.returnTime,
    durationMinutes: request.durationMinutes,
    pickupLocation: request.pickupLocation,
    destination: request.destination,
    intermediateStops: request.intermediateStops,
    passengerCount: request.passengerCount,
    luggageSpecialNeeds: request.luggageSpecialNeeds,
    purpose: request.purpose,
    requestedVehicleType: request.requestedVehicleType,
    driverRequirement: request.driverRequirement,
    tripContactName: request.tripContactName,
    tripContactTelephone: request.tripContactTelephone,
    tripContactEmail: request.tripContactEmail,
    notes: request.notes,
    requestSource: request.requestSource,
  } : emptyRequest;

  async function submitDraft() {
    if (!request) return;
    if (!requestForm.current) return;
    const payload = draftPayload(new FormData(requestForm.current));
    if (!payload.customerId) { setError('Select an existing customer before submitting.'); return; }
    if (payload.reason.length < 8) {
      setError('Enter a reason of at least eight characters before submitting.');
      return;
    }
    setPending(true);
    setError('');
    setNotice('');
    try {
      const baseUrl = `/api/companies/${encodeURIComponent(companyId)}/rental-requests/${encodeURIComponent(request.id)}`;
      const saveResponse = await fetch(baseUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const saveBody = await saveResponse.json() as { error?: string };
      if (!saveResponse.ok) throw new Error(saveBody.error || 'Unable to save Draft changes before submission.');

      const response = await fetch(`${baseUrl}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: payload.reason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(`Draft saved but not submitted: ${body.error || 'required details are missing.'}`);
      setNotice('Rental request submitted.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit this Draft.');
    } finally {
      setPending(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    const payload = draftPayload(form);
    if (!payload.customerId) { setError('Select an existing customer before saving this draft.'); return; }
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(request
        ? `/api/companies/${encodeURIComponent(companyId)}/rental-requests/${encodeURIComponent(request.id)}`
        : `/api/companies/${encodeURIComponent(companyId)}/rental-requests`, {
        method: request ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save this rental request.');
      setNotice('Rental request saved as Draft.');
      router.refresh();
      if (!request) {
        targetForm.reset();
        setPickerResetKey((key) => key + 1);
        setReason('');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this rental request.');
    } finally {
      setPending(false);
    }
  }

  return <section className="vehicle-editor" aria-labelledby="request-editor-title">
    <div className="vehicle-editor-heading"><div><p className="eyebrow">Rental enquiries</p><h2 id="request-editor-title">{request ? 'Edit Draft request' : 'Record an enquiry'}</h2></div>
      {request && <a className="button-link" href="/rentals/requests">Cancel editing</a>}</div>
    <p className="muted">This screen supports Draft creation, Draft edits and the approved Draft → Submitted action only. Quotation, availability and reservation workflows are not available.</p>
    <form ref={requestForm} className="vehicle-form" onSubmit={save}>
      <fieldset className="request-customer-field"><legend>Customer</legend>
        <CustomerPicker key={pickerResetKey} companyId={companyId} current={request ? { id: request.customerId, displayName: request.customerName, reference: null, archived: request.customerArchived } : null} />
        <p className="form-help">Use an existing customer record. <a href="/customers">Create a customer record first</a> if needed.</p>
      </fieldset>
      <fieldset className="request-details-field"><legend>Journey details</legend>
        <div className="vehicle-form-grid">
          <label>Service date<input name="serviceDate" type="date" defaultValue={fields.serviceDate ?? ''} /></label>
          <label>Departure time<input name="departureTime" type="time" defaultValue={fields.departureTime ?? ''} /></label>
          <label>Return time<input name="returnTime" type="time" defaultValue={fields.returnTime ?? ''} /></label>
          <label>Duration (minutes)<input name="durationMinutes" type="number" min="1" max="2147483647" step="1" defaultValue={fields.durationMinutes ?? ''} /></label>
          <label>Pickup location<input name="pickupLocation" maxLength={500} defaultValue={fields.pickupLocation ?? ''} /></label>
          <label>Destination<input name="destination" maxLength={500} defaultValue={fields.destination ?? ''} /></label>
          <label>Passenger count<input name="passengerCount" type="number" min="1" step="1" defaultValue={fields.passengerCount ?? ''} /></label>
          <label>Requested vehicle type<input name="requestedVehicleType" maxLength={100} defaultValue={fields.requestedVehicleType ?? ''} /></label>
          <label>Driver requirement<input name="driverRequirement" maxLength={300} defaultValue={fields.driverRequirement ?? ''} aria-describedby="request-field-help" /></label>
          <label>Purpose<input name="purpose" maxLength={500} defaultValue={fields.purpose ?? ''} /></label>
          <label>Trip contact name<input name="tripContactName" maxLength={160} defaultValue={fields.tripContactName ?? ''} /></label>
          <label>Trip contact telephone<input name="tripContactTelephone" type="tel" maxLength={80} defaultValue={fields.tripContactTelephone ?? ''} /></label>
          <label>Trip contact email<input name="tripContactEmail" type="email" maxLength={254} defaultValue={fields.tripContactEmail ?? ''} /></label>
          <label>Request source<select name="requestSource" defaultValue={fields.requestSource ?? ''}><option value="">Not recorded</option><option value="APP">App</option><option value="PHONE">Phone</option><option value="EMAIL">Email</option><option value="OTHER">Other</option></select></label>
        </div>
        <label>Intermediate stops<textarea name="intermediateStops" rows={3} maxLength={2000} defaultValue={fields.intermediateStops ?? ''} aria-describedby="request-field-help" /></label>
        <label>Luggage or special needs<textarea name="luggageSpecialNeeds" rows={3} maxLength={2000} defaultValue={fields.luggageSpecialNeeds ?? ''} /></label>
        <label>Request notes<textarea name="notes" rows={3} maxLength={2000} defaultValue={fields.notes ?? ''} /></label>
      </fieldset>
      <p id="request-field-help" className="form-help">Use company-confirmed wording for requested vehicle type and driver requirements. No vehicle is assigned during enquiry entry.</p>
      <label>Reason for recording or updating this Draft<input name="reason" required minLength={8} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <p className="form-help">The reason is stored in the audit history; do not include personal or billing details.</p>
      <div className="vehicle-form-actions">
        <button className="button-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : request ? 'Save Draft changes' : 'Save Draft'}</button>
        {request?.status === 'Draft' && <button className="button-submit-request" type="button" disabled={pending} onClick={submitDraft}>{pending ? 'Submitting…' : 'Submit request'}</button>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </form>
  </section>;
}
