'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { enqueueEvent } from './offline-queue';

type ManifestEntry = {
  bookingId: string;
  employeeName: string;
  status: string;
};

class QueuedOfflineError extends Error {
  constructor() { super('Queued offline'); this.name = 'QueuedOfflineError'; }
}

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
  boardingCodeRequired = false,
}: {
  companyId: string;
  manifest: ManifestEntry[];
  returnTo: string;
  tripId: string;
  tripStatus: string;
  /** DRV-03 (D-073): when true, boarding needs the passenger's code or a manual reason. */
  boardingCodeRequired?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [boardingCode, setBoardingCode] = useState('');
  const [manualReason, setManualReason] = useState('');

  const send = async (eventType: string, booking?: string) => {
    setBusy(true); setError(null); setMessage(null);
    // DRV-05 (D-074): the key is generated once for this tap and stored
    // with the queued payload, so an offline retry can never double-apply.
    const idempotencyKey = crypto.randomUUID();
    const payload = {
      eventType,
      idempotencyKey,
      reason: reason.trim() || null,
      bookingId: booking ?? null,
      notes: eventType === 'COMPLETE' || eventType === 'REPORT_DEFECT' ? (notes.trim() || null) : null,
      boardingCode: eventType === 'BOARD' && boardingCode.trim() ? boardingCode.trim() : null,
      manualReason: eventType === 'BOARD' && manualReason.trim() ? manualReason.trim() : null,
    };
    try {
      const response = await fetch(`/api/companies/${companyId}/driver/trips/${tripId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Network-layer failure only: queue on this phone for sync. Server
        // validation answers are shown immediately and never queued.
        enqueueEvent(window.localStorage, {
          id: idempotencyKey, companyId, tripId, eventType, payload,
          queuedAt: new Date().toISOString(), state: 'pending', message: null,
        });
        throw new QueuedOfflineError();
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
      setReason(''); setNotes(''); setBookingId(''); setBoardingCode(''); setManualReason('');
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      if (caught instanceof QueuedOfflineError) {
        setMessage(`${eventType} saved on this phone (pending sync). It will send automatically when connection returns.`);
        setReason(''); setNotes(''); setBookingId(''); setBoardingCode(''); setManualReason('');
        router.refresh();
      } else {
        setError(caught instanceof Error ? caught.message : 'The event could not be recorded.');
      }
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
          {boardingCodeRequired ? (
            <>
              <label className="grid gap-1 text-sm text-slate-700">
                Boarding code (from the passenger)
                <input
                  className="rounded-md border border-slate-300 px-3 py-2 tracking-widest"
                  inputMode="numeric" maxLength={6} placeholder="6-digit code"
                  onChange={(event) => setBoardingCode(event.target.value.replace(/[^0-9]/g, ''))}
                  value={boardingCode}
                />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                Or manual verification reason (if the passenger cannot produce the code)
                <input
                  className="rounded-md border border-slate-300 px-3 py-2"
                  maxLength={500} placeholder="e.g. Passenger known to me, phone battery dead"
                  onChange={(event) => setManualReason(event.target.value)}
                  value={manualReason}
                />
              </label>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !bookingId || (boardingCodeRequired && boardingCode.length !== 6 && manualReason.trim().length < 8)} onClick={() => void send('BOARD', bookingId)} type="button">
              {boardingCodeRequired ? 'Verify & board passenger' : 'Board passenger'}
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
