'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type ManifestEntry = {
  bookingId: string;
  employeeName: string;
  status: string;
};

const EVENT_TARGETS: Record<string, string> = {
  Planned: '',
  'Ready for Dispatch': '',
  Dispatched: 'START — start trip',
  'In Progress': 'COMPLETE — complete trip',
  Delayed: 'RESUME — back on the move',
  Interrupted: 'RESUME — resume trip',
};

export function DriverActions({
  companyId,
  manifest,
  returnTo,
  tripId,
  tripStatus,
}: {
  companyId: string;
  manifest: ManifestEntry[];
  returnTo: string;
  tripId: string;
  tripStatus: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [bookingId, setBookingId] = useState('');

  const send = async (eventType: string, booking?: string) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/driver/trips/${tripId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          idempotencyKey: crypto.randomUUID(),
          reason: reason.trim() || null,
          bookingId: booking ?? null,
          notes: eventType === 'COMPLETE' || eventType === 'REPORT_DEFECT' ? (notes.trim() || null) : null,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const serverMessage = typeof data === 'object' && data !== null
          ? (data as { message?: unknown }).message
          : null;
        throw new Error(typeof serverMessage === 'string' && serverMessage ? serverMessage : 'The event could not be recorded.');
      }
      const duplicate = typeof data === 'object' && data !== null && (data as { duplicate?: unknown }).duplicate === true;
      setMessage(duplicate ? 'Already recorded (safe retry).' : `${eventType} recorded.`);
      setReason(''); setNotes(''); setBookingId('');
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The event could not be recorded.');
    } finally { setBusy(false); }
  };

  const primaryLabel = EVENT_TARGETS[tripStatus] ?? '';
  const primaryEvent = primaryLabel.split(' ')[0] ?? '';
  const canProgress = Boolean(primaryEvent);
  const canEvent = ['Dispatched', 'In Progress', 'Delayed', 'Interrupted'].includes(tripStatus);

  return (
    <div className="mt-5 grid gap-4">
      <label className="grid gap-1 text-sm text-slate-700">
        Reason (required for delay, interruption, no-show and defect reports)
        <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setReason(event.target.value)} value={reason} />
      </label>
      {canProgress ? (
        <button className="rounded-md bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50" disabled={busy} onClick={() => void send(primaryEvent)} type="button">
          {primaryLabel}
        </button>
      ) : null}
      {canEvent ? (
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={busy} onClick={() => void send('DELAY')} type="button">
            Report delay
          </button>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={busy} onClick={() => void send('INTERRUPT')} type="button">
            Report interruption
          </button>
          <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={busy} onClick={() => void send('REPORT_DEFECT')} type="button">
            Report vehicle defect
          </button>
        </div>
      ) : null}
      {['Dispatched', 'In Progress', 'Delayed'].includes(tripStatus) ? (
        <div className="grid gap-3 rounded-md bg-slate-50 p-3">
          <label className="grid gap-1 text-sm text-slate-700">
            Passenger
            <select className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setBookingId(event.target.value)} value={bookingId}>
              <option value="">Select passenger</option>
              {manifest.filter((entry) => entry.status === 'Assigned').map((entry) => (
                <option key={entry.bookingId} value={entry.bookingId}>{entry.employeeName}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !bookingId} onClick={() => void send('BOARD', bookingId)} type="button">
              Board passenger
            </button>
            <button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={busy || !bookingId} onClick={() => void send('NO_SHOW', bookingId)} type="button">
              Mark no-show
            </button>
          </div>
        </div>
      ) : null}
      {canEvent ? (
        <label className="grid gap-1 text-sm text-slate-700">
          Completion / defect notes
          <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setNotes(event.target.value)} value={notes} />
        </label>
      ) : null}
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="text-sm text-green-700" role="status">{message}</p> : null}
    </div>
  );
}
