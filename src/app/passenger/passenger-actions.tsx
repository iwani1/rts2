'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

function readApiError(data: unknown, fallback: string) {
  if (typeof data === 'object' && data !== null) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

const inputClass = 'rounded-md border border-slate-300 px-3 py-2';
const labelClass = 'text-sm text-slate-700';
const labelText = 'mb-1 block font-medium text-slate-500';

export function JourneyRequestForm({
  companyId,
  routes,
  locations,
  eligible,
}: {
  companyId: string;
  routes: Array<{ id: string; label: string }>;
  locations: Array<{ id: string; label: string }>;
  eligible: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/passenger/journeys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bookingType: String(formData.get('bookingType') ?? 'HOME_TO_OFFICE'),
          journeyDate: String(formData.get('journeyDate') ?? ''),
          routeId: String(formData.get('routeId') ?? '') || null,
          contractId: null,
          pickupLocationId: String(formData.get('pickupLocationId') ?? '') || null,
          dropoffLocationId: String(formData.get('dropoffLocationId') ?? '') || null,
          notes: String(formData.get('notes') ?? '').trim() || null,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(data, 'The journey request could not be recorded.'));
      setMessage('Journey requested. Operations will confirm it; watch this page for updates.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The journey request could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  if (!eligible) {
    return (
      <p className="text-sm text-amber-800">
        Transport eligibility has not been confirmed on your record, so journey requests are
        unavailable. Please contact the operations team.
      </p>
    );
  }

  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}><span className={labelText}>Journey type</span>
        <select className={inputClass} name="bookingType" defaultValue="HOME_TO_OFFICE">
          <option value="HOME_TO_OFFICE">Home to office</option>
          <option value="OFFICE_TO_HOME">Office to home</option>
          <option value="RETURN">Return journey</option>
          <option value="ONE_TIME">One-time journey</option>
        </select></label>
      <label className={labelClass}><span className={labelText}>Journey date</span>
        <input className={inputClass} name="journeyDate" required type="date" /></label>
      <label className={labelClass}><span className={labelText}>Route (optional)</span>
        <select className={inputClass} name="routeId" defaultValue="">
          <option value="">No preference</option>
          {routes.map((route) => <option key={route.id} value={route.id}>{route.label}</option>)}
        </select></label>
      <label className={labelClass}><span className={labelText}>Pickup point (optional)</span>
        <select className={inputClass} name="pickupLocationId" defaultValue="">
          <option value="">My approved pickup point</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
        </select></label>
      <label className={labelClass}><span className={labelText}>Drop-off point (optional)</span>
        <select className={inputClass} name="dropoffLocationId" defaultValue="">
          <option value="">My approved drop-off point</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
        </select></label>
      <label className={labelClass}><span className={labelText}>Notes (optional)</span>
        <input className={inputClass} name="notes" maxLength={2000} placeholder="Anything operations should know" /></label>
      <div className="sm:col-span-2">
        <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} type="submit">
          {busy ? 'Requesting…' : 'Request journey'}
        </button>
        {message ? <p className="mt-2 text-sm text-emerald-800" role="status">{message}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
      </div>
    </form>
  );
}

export function JourneyActions({
  companyId,
  bookingId,
  canCancel,
  status,
  hasFeedback,
}: {
  companyId: string;
  bookingId: string;
  canCancel: boolean;
  status: string;
  hasFeedback: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function post(path: string, body: Record<string, unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/passenger/journeys/${bookingId}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(data, fallback));
      setDone(path === 'cancel' ? 'Journey cancelled.' : 'Feedback recorded — thank you.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {canCancel ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const reason = String(new FormData(event.currentTarget).get('reason') ?? '');
            void post('cancel', { reason }, 'The journey could not be cancelled.');
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className={labelClass}><span className={labelText}>Cancellation reason</span>
            <input className={inputClass} name="reason" required minLength={8} maxLength={500} placeholder="Why are you cancelling?" /></label>
          <button className="rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50" disabled={busy} type="submit">
            Cancel journey
          </button>
        </form>
      ) : null}
      {status === 'Completed' && !hasFeedback ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const ratingRaw = String(form.get('rating') ?? '');
            void post('feedback', {
              rating: ratingRaw ? Number(ratingRaw) : null,
              comment: String(form.get('comment') ?? ''),
            }, 'Feedback could not be recorded.');
          }}
          className="grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-end"
        >
          <label className={labelClass}><span className={labelText}>Rating</span>
            <select className={inputClass} name="rating" defaultValue="">
              <option value="">No rating</option>
              {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
            </select></label>
          <label className={labelClass}><span className={labelText}>How was the journey?</span>
            <input className={inputClass} name="comment" required minLength={3} maxLength={1000} placeholder="Your feedback" /></label>
          <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} type="submit">
            Send feedback
          </button>
        </form>
      ) : null}
      {done ? <p className="text-sm text-emerald-800" role="status">{done}</p> : null}
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
