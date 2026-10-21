'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TRIP_STATUSES, allowedTripTargets } from '@/modules/trips/trip-transitions';

type Option = { id: string; label: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readApiError(data: unknown, fallback: string) {
  if (typeof data === 'object' && data !== null) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export function TripsManager({
  acceptedBookings,
  canManage,
  clients,
  companyId,
  manifestBookings,
  routes,
  selectedTripId,
  selectedTripStatus,
  returnTo,
}: {
  acceptedBookings: Option[];
  canManage: boolean;
  clients: Option[];
  companyId: string;
  manifestBookings: Option[];
  routes: Option[];
  selectedTripId: string | null;
  selectedTripStatus: string | null;
  returnTo: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [tripDate, setTripDate] = useState(today());
  const [plannedStartTime, setPlannedStartTime] = useState('');
  const [capacityLimit, setCapacityLimit] = useState('');
  const [reason, setReason] = useState('');
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [generateReason, setGenerateReason] = useState('');
  const [toStatus, setToStatus] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [delayReason, setDelayReason] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [assignBookingId, setAssignBookingId] = useState('');
  const [assignReason, setAssignReason] = useState('');
  const [removeBookingId, setRemoveBookingId] = useState('');
  const [removeReason, setRemoveReason] = useState('');

  const post = async (path: string, body: unknown, fallback: string) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(readApiError(data, fallback));
    return data;
  };

  const create = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const data = await post(`/api/companies/${companyId}/trips`, {
        clientId: clientId || null,
        routeId: routeId || null,
        serviceType: serviceType.trim() || null,
        tripDate,
        plannedStartTime: plannedStartTime || null,
        plannedDurationMinutes: null,
        capacityLimit: capacityLimit ? Number(capacityLimit) : null,
        reason,
      }, 'The trip could not be created.') as { trip?: { reference: string } };
      setMessage(`Trip ${data.trip?.reference ?? ''} created as Planned.`);
      setReason('');
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The trip could not be created.');
    } finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const data = await post(`/api/companies/${companyId}/trips/generate`, {
        fromDate, toDate, reason: generateReason,
      }, 'Trips could not be generated.') as { created?: number; skipped?: number };
      setMessage(`Generated ${data.created ?? 0} trip(s); ${data.skipped ?? 0} already existed.`);
      setGenerateReason('');
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Trips could not be generated.');
    } finally { setBusy(false); }
  };

  const transition = async () => {
    if (!selectedTripId || !toStatus) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await post(`/api/companies/${companyId}/trips/${selectedTripId}/transition`, {
        toStatus, reason: transitionReason,
        delayReason: toStatus === 'Delayed' ? (delayReason.trim() || null) : null,
        completionNotes: toStatus === 'Completed' ? (completionNotes.trim() || null) : null,
      }, 'The trip status could not be changed.');
      setMessage(`Trip moved to ${toStatus}.`);
      setTransitionReason(''); setDelayReason(''); setCompletionNotes(''); setToStatus('');
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The trip status could not be changed.');
    } finally { setBusy(false); }
  };

  const assign = async () => {
    if (!selectedTripId || !assignBookingId) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await post(`/api/companies/${companyId}/trips/${selectedTripId}/assign`, {
        bookingId: assignBookingId, reason: assignReason,
      }, 'The booking could not be assigned.');
      setMessage('Booking assigned to the trip.');
      setAssignBookingId(''); setAssignReason('');
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The booking could not be assigned.');
    } finally { setBusy(false); }
  };

  const unassign = async () => {
    if (!selectedTripId || !removeBookingId) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await post(`/api/companies/${companyId}/trips/${selectedTripId}/unassign`, {
        bookingId: removeBookingId, reason: removeReason,
      }, 'The booking could not be removed.');
      setMessage('Booking removed from the trip; it is Accepted again.');
      setRemoveBookingId(''); setRemoveReason('');
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The booking could not be removed.');
    } finally { setBusy(false); }
  };

  if (!canManage) {
    return (
      <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm text-slate-600">Your trip access is read-only.</p>
        {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      </section>
    );
  }

  const targets = selectedTripStatus ? allowedTripTargets(selectedTripStatus) : [];
  const assignable = ['Planned', 'Ready for Dispatch'].includes(selectedTripStatus ?? '');

  return (
    <div className="mt-8 grid gap-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Create a manual trip</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm text-slate-700">Route
            <select className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setRouteId(event.target.value)} value={routeId}>
              <option value="">No route (ad hoc)</option>
              {routes.map((route) => (<option key={route.id} value={route.id}>{route.label}</option>))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-slate-700">Client
            <select className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setClientId(event.target.value)} value={clientId}>
              <option value="">Select client</option>
              {clients.map((client) => (<option key={client.id} value={client.id}>{client.label}</option>))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-slate-700">Service type
            <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setServiceType(event.target.value)} value={serviceType} />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">Trip date
            <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setTripDate(event.target.value)} type="date" value={tripDate} />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">Planned start (HH:MM)
            <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setPlannedStartTime(event.target.value)} placeholder="06:30" value={plannedStartTime} />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">Capacity limit (optional)
            <input className="rounded-md border border-slate-300 px-3 py-2" min={1} onChange={(event) => setCapacityLimit(event.target.value)} type="number" value={capacityLimit} />
          </label>
          <label className="grid gap-1 text-sm text-slate-700 md:col-span-3">Reason (required, min 8 chars)
            <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setReason(event.target.value)} value={reason} />
          </label>
        </div>
        <button className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={() => void create()} type="button">
          Create trip
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Generate trips from schedules</h2>
        <p className="mt-1 text-sm text-slate-600">Creates one Planned trip per active schedule occurrence (at most 31 days). Regenerating the same range creates nothing twice.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm text-slate-700">From
            <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setFromDate(event.target.value)} type="date" value={fromDate} />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">To
            <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setToDate(event.target.value)} type="date" value={toDate} />
          </label>
          <label className="grid gap-1 text-sm text-slate-700">Reason (required, min 8 chars)
            <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setGenerateReason(event.target.value)} value={generateReason} />
          </label>
        </div>
        <button className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={() => void generate()} type="button">
          Generate trips
        </button>
      </section>

      {selectedTripId ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-950">Trip lifecycle — currently {selectedTripStatus}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="grid gap-1 text-sm text-slate-700">Move to
                <select className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setToStatus(event.target.value)} value={toStatus}>
                  <option value="">Select next status</option>
                  {targets.map((target) => (<option key={target} value={target}>{target}</option>))}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-slate-700">Reason (required, min 8 chars)
                <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setTransitionReason(event.target.value)} value={transitionReason} />
              </label>
              {toStatus === 'Delayed' ? (
                <label className="grid gap-1 text-sm text-slate-700">Delay reason
                  <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setDelayReason(event.target.value)} value={delayReason} />
                </label>
              ) : null}
              {toStatus === 'Completed' ? (
                <label className="grid gap-1 text-sm text-slate-700">Completion notes
                  <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setCompletionNotes(event.target.value)} value={completionNotes} />
                </label>
              ) : null}
            </div>
            <button className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !toStatus} onClick={() => void transition()} type="button">
              Apply status change
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Available next: {targets.length ? targets.join(', ') : 'none (terminal)'}.
              All statuses: {TRIP_STATUSES.join(' · ')}. Dispatch requires a vehicle and a driver (dispatch board slice).
            </p>
          </section>

          {assignable ? (
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-950">Assign and remove bookings</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="grid gap-1 text-sm text-slate-700">Accepted booking (trip date)
                  <select className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setAssignBookingId(event.target.value)} value={assignBookingId}>
                    <option value="">Select booking</option>
                    {acceptedBookings.map((booking) => (<option key={booking.id} value={booking.id}>{booking.label}</option>))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-slate-700">Reason (required, min 8 chars)
                  <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setAssignReason(event.target.value)} value={assignReason} />
                </label>
                <div className="flex items-end">
                  <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !assignBookingId} onClick={() => void assign()} type="button">
                    Assign to trip
                  </button>
                </div>
                <label className="grid gap-1 text-sm text-slate-700">Manifest booking to remove
                  <select className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setRemoveBookingId(event.target.value)} value={removeBookingId}>
                    <option value="">Select booking</option>
                    {manifestBookings.map((booking) => (<option key={booking.id} value={booking.id}>{booking.label}</option>))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-slate-700">Removal reason (required, min 8 chars)
                  <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setRemoveReason(event.target.value)} value={removeReason} />
                </label>
                <div className="flex items-end">
                  <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={busy || !removeBookingId} onClick={() => void unassign()} type="button">
                    Remove from trip
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Capacity is checked inside a transaction with the trip row locked; parallel assignments cannot exceed the limit.
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="text-sm text-green-700" role="status">{message}</p> : null}
    </div>
  );
}
