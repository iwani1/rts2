'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABELS,
} from '@/modules/incidents/incident-transitions';

const fieldClass = 'rounded-md border border-slate-300 px-3 py-2';

const REPORTABLE = ['Ready for Dispatch', 'Dispatched', 'In Progress', 'Delayed', 'Interrupted'];

/**
 * INC-01/02 (D-071): a driver reports a problem against their own active
 * trip. Dispatch is alerted immediately; the trip itself is unchanged
 * until a dispatcher responds.
 */
export function DriverIncidentReportForm({ companyId, trips }: {
  companyId: string;
  trips: Array<{ id: string; reference: string; status: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const activeTrips = trips.filter((trip) => REPORTABLE.includes(trip.status));
  const [tripId, setTripId] = useState(activeTrips[0]?.id ?? '');
  const [incidentType, setIncidentType] = useState('BREAKDOWN');
  const [severity, setSeverity] = useState('HIGH');
  const [locationText, setLocationText] = useState('');
  const [description, setDescription] = useState('');
  const [immediateAction, setImmediateAction] = useState('');

  if (activeTrips.length === 0) return null;

  return (
    <section className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5">
      <h2 className="text-lg font-semibold text-slate-950">Report a problem</h2>
      <p className="mt-1 text-sm text-slate-600">
        Use this for a breakdown or any problem on the road. Dispatch is alerted straight away.
      </p>
      <form
        className="mt-4 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          startTransition(async () => {
            const response = await fetch(`/api/companies/${companyId}/incidents/driver-report`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                tripId,
                incidentType,
                severity,
                occurredAt: new Date().toISOString(),
                locationText: locationText.trim() || null,
                description: description.trim(),
                immediateAction: immediateAction.trim() || null,
                reason: 'Reported by the driver from the driver view.',
              }),
            });
            const payload = (await response.json().catch(() => null)) as
              | { message?: string; data?: { reference?: string } }
              | null;
            if (!response.ok) {
              setMessage(payload?.message ?? 'The report could not be sent.');
              return;
            }
            setMessage(`Report ${payload?.data?.reference ?? ''} sent. Dispatch has been alerted.`);
            setDescription('');
            setLocationText('');
            setImmediateAction('');
            router.refresh();
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm text-slate-700">
            Trip
            <select className={fieldClass} value={tripId} onChange={(e) => setTripId(e.target.value)}>
              {activeTrips.map((trip) => (
                <option key={trip.id} value={trip.id}>{trip.reference} — {trip.status}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            Problem
            <select className={fieldClass} value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
              {INCIDENT_TYPES.map((type) => (
                <option key={type} value={type}>{INCIDENT_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-slate-700">
            Severity
            <select className={fieldClass} value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {INCIDENT_SEVERITIES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="grid gap-1 text-sm text-slate-700">
          Where are you?
          <input className={fieldClass} value={locationText} onChange={(e) => setLocationText(e.target.value)} maxLength={300} placeholder="e.g. Near Achimota overhead" />
        </label>
        <label className="grid gap-1 text-sm text-slate-700">
          What happened?
          <textarea className={fieldClass} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} required minLength={8} maxLength={2000} />
        </label>
        <label className="grid gap-1 text-sm text-slate-700">
          What have you done so far?
          <input className={fieldClass} value={immediateAction} onChange={(e) => setImmediateAction(e.target.value)} maxLength={1000} placeholder="e.g. Parked safely, passengers informed" />
        </label>
        <div>
          <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pending} type="submit">
            {pending ? 'Sending…' : 'Send report to dispatch'}
          </button>
          {message ? <p className="mt-2 text-sm text-slate-700" role="status">{message}</p> : null}
        </div>
      </form>
    </section>
  );
}
