'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RentalPortalRequestSummary } from '@/modules/rental-portal/portal';

type RequestDefaults = Partial<RentalPortalRequestSummary>;

function text(form: FormData, name: string) {
  const entry = form.get(name);
  const value = typeof entry === 'string' ? entry.trim() : '';
  return value === '' ? null : value;
}

function numberOrNull(form: FormData, name: string) {
  const entry = form.get(name);
  const value = typeof entry === 'string' ? entry.trim() : '';
  return value === '' ? null : Number(value);
}

function reasonOrDefault(form: FormData, fallback: string) {
  const entry = form.get('reason');
  const value = typeof entry === 'string' ? entry.trim() : '';
  return value === '' ? fallback : value;
}

function requestPayload(form: FormData, reason: string) {
  return {
    serviceDate: text(form, 'serviceDate'),
    departureTime: text(form, 'departureTime'),
    returnTime: text(form, 'returnTime'),
    returnDate: text(form, 'returnDate') ?? undefined,
    durationMinutes: numberOrNull(form, 'durationMinutes'),
    pickupLocation: text(form, 'pickupLocation'),
    destination: text(form, 'destination'),
    intermediateStops: text(form, 'intermediateStops'),
    passengerCount: numberOrNull(form, 'passengerCount'),
    luggageSpecialNeeds: text(form, 'luggageSpecialNeeds'),
    purpose: text(form, 'purpose'),
    requestedVehicleType: text(form, 'requestedVehicleType'),
    driverRequirement: text(form, 'driverRequirement'),
    tripContactName: text(form, 'tripContactName'),
    tripContactTelephone: text(form, 'tripContactTelephone'),
    tripContactEmail: text(form, 'tripContactEmail'),
    notes: text(form, 'notes'),
    reason,
  };
}

async function postJson(url: string, method: string, payload: unknown) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
  if (!response.ok) throw new Error(body.message || body.error || 'Something went wrong. Please try again.');
}

function RequestFields({ defaults }: { defaults: RequestDefaults }) {
  return <div className="vehicle-form-grid">
    <label>Service date<input name="serviceDate" type="date" defaultValue={defaults.serviceDate ?? ''} /></label>
    <label>Departure time<input name="departureTime" type="time" defaultValue={defaults.departureTime ?? ''} /></label>
    <label>Return time (optional)<input name="returnTime" type="time" defaultValue={defaults.returnTime ?? ''} /></label>
    <label>Return date, if next day (optional)<input name="returnDate" type="date" defaultValue={defaults.returnDate ?? ''} /></label>
    <label>Or duration in minutes (optional)<input name="durationMinutes" type="number" min={1} step={1} defaultValue={defaults.durationMinutes ?? ''} /></label>
    <label>Passengers<input name="passengerCount" type="number" min={1} step={1} defaultValue={defaults.passengerCount ?? ''} /></label>
    <label>Pickup location<input name="pickupLocation" maxLength={500} defaultValue={defaults.pickupLocation ?? ''} /></label>
    <label>Destination<input name="destination" maxLength={500} defaultValue={defaults.destination ?? ''} /></label>
    <label>Intermediate stops (optional)<input name="intermediateStops" maxLength={2000} defaultValue={defaults.intermediateStops ?? ''} /></label>
    <label>Vehicle type wanted (optional)<input name="requestedVehicleType" maxLength={100} defaultValue={defaults.requestedVehicleType ?? ''} /></label>
    <label>Purpose (optional)<input name="purpose" maxLength={500} defaultValue={defaults.purpose ?? ''} /></label>
    <label>Driver requirement (optional)<input name="driverRequirement" maxLength={300} defaultValue={defaults.driverRequirement ?? ''} /></label>
    <label>Trip contact name (optional)<input name="tripContactName" maxLength={160} defaultValue={defaults.tripContactName ?? ''} /></label>
    <label>Trip contact telephone (optional)<input name="tripContactTelephone" maxLength={80} defaultValue={defaults.tripContactTelephone ?? ''} /></label>
    <label>Trip contact email (optional)<input name="tripContactEmail" type="email" maxLength={254} defaultValue={defaults.tripContactEmail ?? ''} /></label>
    <label>Luggage or special needs (optional)<input name="luggageSpecialNeeds" maxLength={2000} defaultValue={defaults.luggageSpecialNeeds ?? ''} /></label>
    <label>Notes (optional)<input name="notes" maxLength={2000} defaultValue={defaults.notes ?? ''} /></label>
  </div>;
}

export function RentalEnquiryForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    setPending(true);
    setError('');
    setNotice('');
    try {
      await postJson(
        `/api/companies/${encodeURIComponent(companyId)}/rental-portal/requests`,
        'POST',
        requestPayload(form, reasonOrDefault(form, 'Customer created a rental enquiry in the portal')),
      );
      setNotice('Enquiry saved as a Draft. Review it below, then submit when ready.');
      targetForm.reset();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this enquiry.');
    } finally {
      setPending(false);
    }
  }

  return <form className="vehicle-form" onSubmit={create}>
    <RequestFields defaults={{}} />
    <label>Anything we should note about this enquiry? (optional)<input name="reason" minLength={8} maxLength={500} /></label>
    <div className="vehicle-form-actions">
      <button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Saving…' : 'Save Draft enquiry'}</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </form>;
}

export function RentalDraftActions({ companyId, request }: {
  companyId: string; request: RentalPortalRequestSummary;
}) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const base = `/api/companies/${encodeURIComponent(companyId)}/rental-portal/requests/${encodeURIComponent(request.requestId)}`;

  async function run(action: () => Promise<void>, success: string) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return <div>
    {request.canEdit && <details className="vehicle-archive">
      <summary>Edit this Draft</summary>
      <form className="vehicle-form" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void run(
          () => postJson(base, 'PUT', requestPayload(form, reasonOrDefault(form, 'Customer updated their Draft enquiry'))),
          'Draft updated.',
        );
      }}>
        <RequestFields defaults={request} />
        <label>Note about this change (optional)<input name="reason" minLength={8} maxLength={500} /></label>
        <div className="vehicle-form-actions">
          <button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Saving…' : 'Save Draft changes'}</button>
        </div>
      </form>
    </details>}
    {request.canSubmit && <form onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void run(
        () => postJson(`${base}/submit`, 'POST', { reason: reasonOrDefault(form, 'Customer submitted their rental request') }),
        'Request submitted. Our team will review it and get back to you.',
      );
    }}>
      <label>Message to our team (optional)<input name="reason" minLength={8} maxLength={500} /></label>
      <div className="vehicle-form-actions">
        <button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Submitting…' : 'Submit request'}</button>
      </div>
    </form>}
    {request.canWithdraw && <details className="vehicle-archive">
      <summary>Withdraw this request</summary>
      <form onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const entry = form.get('reason');
        void run(
          () => postJson(`${base}/withdraw`, 'POST', { reason: typeof entry === 'string' ? entry : '' }),
          'Request withdrawn.',
        );
      }}>
        <label>Reason for withdrawing<input name="reason" required minLength={8} maxLength={500} /></label>
        <button type="submit" className="button-danger" disabled={!interactive || pending}>{pending ? 'Working…' : 'Withdraw request'}</button>
      </form>
    </details>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </div>;
}
