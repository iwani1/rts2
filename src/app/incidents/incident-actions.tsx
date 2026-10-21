'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABELS,
  allowedIncidentTargets,
} from '@/modules/incidents/incident-transitions';

type Option = { id: string; label: string };

function usePost() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const post = (url: string, body: unknown, done: string) => {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setMessage(payload?.message ?? 'The request could not be completed.');
        return;
      }
      setMessage(done);
      router.refresh();
    });
  };
  return { pending, message, post };
}

const fieldClass = 'rounded-md border border-slate-300 px-3 py-2';

export function ReportIncidentForm({ companyId, trips, vehicles, drivers }: {
  companyId: string;
  trips: Option[];
  vehicles: Option[];
  drivers: Option[];
}) {
  const { pending, message, post } = usePost();
  const [incidentType, setIncidentType] = useState('BREAKDOWN');
  const [severity, setSeverity] = useState('MEDIUM');
  const [tripId, setTripId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [locationText, setLocationText] = useState('');
  const [description, setDescription] = useState('');
  const [peopleAffected, setPeopleAffected] = useState('');
  const [immediateAction, setImmediateAction] = useState('');
  const [reason, setReason] = useState('');

  return (
    <form
      className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        post(`/api/companies/${companyId}/incidents`, {
          incidentType,
          severity,
          tripId: tripId || null,
          vehicleId: vehicleId || null,
          driverId: driverId || null,
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
          locationText: locationText.trim() || null,
          description: description.trim(),
          peopleAffected: peopleAffected.trim() || null,
          immediateAction: immediateAction.trim() || null,
          reason: reason.trim(),
        }, 'Incident recorded and dispatchers alerted.');
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm text-slate-700">
          Type
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
        <label className="grid gap-1 text-sm text-slate-700">
          When it happened
          <input
            className={fieldClass} type="datetime-local" value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)} required
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm text-slate-700">
          Trip (if any)
          <select className={fieldClass} value={tripId} onChange={(e) => setTripId(e.target.value)}>
            <option value="">Not trip-related</option>
            {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-slate-700">
          Vehicle (if any)
          <select className={fieldClass} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">None</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-slate-700">
          Driver (if any)
          <select className={fieldClass} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">None</option>
            {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.label}</option>)}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm text-slate-700">
        Location
        <input className={fieldClass} value={locationText} onChange={(e) => setLocationText(e.target.value)} maxLength={300} placeholder="e.g. Accra–Tema motorway, near Junction" />
      </label>
      <label className="grid gap-1 text-sm text-slate-700">
        Description
        <textarea className={fieldClass} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} required minLength={8} maxLength={2000} />
      </label>
      <label className="grid gap-1 text-sm text-slate-700">
        People affected (restricted — incident managers only)
        <input className={fieldClass} value={peopleAffected} onChange={(e) => setPeopleAffected(e.target.value)} maxLength={1000} />
      </label>
      <label className="grid gap-1 text-sm text-slate-700">
        Immediate action taken
        <input className={fieldClass} value={immediateAction} onChange={(e) => setImmediateAction(e.target.value)} maxLength={1000} />
      </label>
      <label className="grid gap-1 text-sm text-slate-700">
        Reason for this record
        <input className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={8} maxLength={500} />
      </label>
      <div>
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pending} type="submit">
          {pending ? 'Recording…' : 'Record incident'}
        </button>
        {message ? <p className="mt-2 text-sm text-slate-700" role="status">{message}</p> : null}
      </div>
    </form>
  );
}

export function IncidentTransitionForm({ companyId, incidentId, status }: {
  companyId: string;
  incidentId: string;
  status: string;
}) {
  const { pending, message, post } = usePost();
  const targets = allowedIncidentTargets(status);
  const [toStatus, setToStatus] = useState(targets[0] ?? '');
  const [reason, setReason] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  if (targets.length === 0) {
    return <p className="mt-3 text-sm text-slate-600">This incident is closed; no further changes are possible.</p>;
  }
  return (
    <form
      className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        post(`/api/companies/${companyId}/incidents/${incidentId}/transition`, {
          toStatus,
          reason: reason.trim(),
          ...(toStatus === 'Resolved' ? { resolutionNotes: resolutionNotes.trim() } : {}),
        }, `Incident moved to ${toStatus}.`);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm text-slate-700">
          Move to
          <select className={fieldClass} value={toStatus} onChange={(e) => setToStatus(e.target.value as (typeof targets)[number])}>
            {targets.map((target) => <option key={target} value={target}>{target}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-slate-700">
          Reason
          <input className={fieldClass} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={8} maxLength={500} />
        </label>
      </div>
      {toStatus === 'Resolved' ? (
        <label className="grid gap-1 text-sm text-slate-700">
          Resolution notes (required)
          <textarea
            className={fieldClass} value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)} rows={3} required minLength={8} maxLength={2000}
          />
        </label>
      ) : null}
      <div>
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pending} type="submit">
          {pending ? 'Saving…' : 'Save status change'}
        </button>
        {message ? <p className="mt-2 text-sm text-slate-700" role="status">{message}</p> : null}
      </div>
      <p className="text-xs text-slate-500">
        Statuses: {INCIDENT_STATUSES.join(' → ')} (Resolved may reopen to In Progress).
      </p>
    </form>
  );
}
