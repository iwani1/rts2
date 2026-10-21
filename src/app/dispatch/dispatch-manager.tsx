'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TripManifestEntry, TripRecord } from '@/modules/trips/trips';

type Option = { id: string; label: string };

function readApiError(data: unknown, fallback: string) {
  if (typeof data === 'object' && data !== null) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export function DispatchManager({
  companyId,
  drivers,
  returnTo,
  selectedTripId,
  selectedTripStatus,
  selectedManifest,
  vehicles,
}: {
  companyId: string;
  drivers: Option[];
  returnTo: string;
  selectedTripId: string | null;
  selectedTripStatus: string | null;
  selectedManifest: { trip: TripRecord; entries: TripManifestEntry[] } | null;
  vehicles: Option[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');
  const [noShowBookingId, setNoShowBookingId] = useState('');
  const [noShowReason, setNoShowReason] = useState('');

  const assignable = ['Planned', 'Ready for Dispatch'].includes(selectedTripStatus ?? '');

  const saveResources = async () => {
    if (!selectedTripId) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/trips/${selectedTripId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(vehicleId ? { vehicleId } : {}),
          ...(driverId ? { driverId } : {}),
          override,
          reason,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(data, 'Resources could not be assigned.'));
      const warnings = (data as { warnings?: Array<{ type: string }> }).warnings ?? [];
      setMessage(warnings.length
        ? `Assigned with override; conflicts recorded: ${warnings.map((warning) => warning.type).join(', ')}.`
        : 'Resources assigned.');
      setReason(''); setOverride(false);
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Resources could not be assigned.');
    } finally { setBusy(false); }
  };

  const clearResources = async (resource: 'vehicleId' | 'driverId') => {
    if (!selectedTripId) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/trips/${selectedTripId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [resource]: null, reason: reason || 'Clearing the assigned resource from the dispatch board' }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(data, 'The resource could not be cleared.'));
      setMessage('Resource cleared.');
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The resource could not be cleared.');
    } finally { setBusy(false); }
  };

  const recordNoShow = async () => {
    if (!selectedTripId || !noShowBookingId) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/trips/${selectedTripId}/noshow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: noShowBookingId, reason: noShowReason }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(data, 'The no-show could not be recorded.'));
      setMessage('No-show recorded; the seat is free and the booking is Cancelled with the reason in its history.');
      setNoShowBookingId(''); setNoShowReason('');
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The no-show could not be recorded.');
    } finally { setBusy(false); }
  };

  if (!selectedTripId || !selectedManifest) {
    return (
      <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm text-slate-600">Select a trip on the board to manage its resources.</p>
        {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      </section>
    );
  }

  const { trip, entries } = selectedManifest;

  return (
    <div className="mt-8 grid gap-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Resources — {trip.reference} ({trip.status})</h2>
        <p className="mt-1 text-sm text-slate-600">
          Vehicle: {trip.vehicleRegistration ?? 'not assigned'} · Driver: {trip.driverName ?? 'not assigned'}.
          {assignable ? '' : ' Resources can only change while Planned or Ready for Dispatch.'}
        </p>
        {assignable ? (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-slate-700">Vehicle
                <select className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setVehicleId(event.target.value)} value={vehicleId}>
                  <option value="">Select vehicle</option>
                  {vehicles.map((vehicle) => (<option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>))}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-slate-700">Driver
                <select className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setDriverId(event.target.value)} value={driverId}>
                  <option value="">Select driver</option>
                  {drivers.map((driver) => (<option key={driver.id} value={driver.id}>{driver.label}</option>))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input checked={override} onChange={(event) => setOverride(event.target.checked)} type="checkbox" />
                Override conflicts (day conflicts / seat shortfall). Safety blocks and expired licences cannot be overridden.
              </label>
              <label className="grid gap-1 text-sm text-slate-700">Reason (required, min 8 chars)
                <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setReason(event.target.value)} value={reason} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy || (!vehicleId && !driverId)} onClick={() => void saveResources()} type="button">
                Assign resources
              </button>
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={busy} onClick={() => void clearResources('vehicleId')} type="button">
                Clear vehicle
              </button>
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={busy} onClick={() => void clearResources('driverId')} type="button">
                Clear driver
              </button>
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Manifest and no-shows — {entries.length} passenger(s)</h2>
        {entries.length ? (
          <ul className="mt-3 grid gap-1 text-sm text-slate-700">
            {entries.map((entry) => (
              <li key={entry.bookingId}>{entry.employeeName} — {entry.bookingReference} ({entry.status})</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No passengers assigned yet.</p>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm text-slate-700">Passenger to mark as no-show
            <select className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setNoShowBookingId(event.target.value)} value={noShowBookingId}>
              <option value="">Select booking</option>
              {entries.filter((entry) => entry.status === 'Assigned').map((entry) => (
                <option key={entry.bookingId} value={entry.bookingId}>{entry.employeeName} — {entry.bookingReference}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-slate-700">No-show reason (required, min 8 chars)
            <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setNoShowReason(event.target.value)} value={noShowReason} />
          </label>
          <div className="flex items-end">
            <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={busy || !noShowBookingId} onClick={() => void recordNoShow()} type="button">
              Record no-show
            </button>
          </div>
        </div>
      </section>

      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="text-sm text-green-700" role="status">{message}</p> : null}
    </div>
  );
}
