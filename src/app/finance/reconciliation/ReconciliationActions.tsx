'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ReconciliationActions({
  companyId,
  closeReconciliationId,
}: {
  companyId: string;
  closeReconciliationId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function act(action: () => Promise<Response>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await action();
      const body = await response.json() as { message?: string; error?: string };
      if (!response.ok) {
        setError(body.message ?? body.error ?? 'The action did not complete.');
        return;
      }
      setNotice(success);
      router.refresh();
    } catch {
      setError('The action did not complete.');
    } finally {
      setBusy(false);
    }
  }

  if (closeReconciliationId) {
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-slate-600">
            <span className="mb-1 block font-medium text-slate-500">Close reason (required, at least 8 characters)</span>
            <input className="w-64 rounded-md border border-slate-300 px-3 py-2" id={`close-reason-${closeReconciliationId}`} disabled={busy} placeholder="Discrepancies reviewed" />
          </label>
          <button
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void act(
              () => fetch(`/api/companies/${companyId}/reconciliations/${closeReconciliationId}/transition`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ toStatus: 'CLOSED', reason: (document.getElementById(`close-reason-${closeReconciliationId}`) as HTMLInputElement)?.value ?? '' }),
              }),
              'Reconciliation closed.',
            )}
            type="button"
          >Close run</button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
        {notice ? <p className="mt-2 text-sm text-emerald-700" role="status">{notice}</p> : null}
      </div>
    );
  }

  return (
    <form
      className="mt-6 rounded-lg border border-slate-200 px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void act(
          () => fetch(`/api/companies/${companyId}/reconciliations`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              periodStart: String(form.get('periodStart') ?? ''),
              periodEnd: String(form.get('periodEnd') ?? ''),
              reason: String(form.get('reason') ?? ''),
            }),
          }),
          'Reconciliation run opened.',
        );
      }}
    >
      <h2 className="text-base font-semibold text-slate-950">Open a reconciliation run</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Period start</span>
          <input className="rounded-md border border-slate-300 px-3 py-2" name="periodStart" required type="date" />
        </label>
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Period end</span>
          <input className="rounded-md border border-slate-300 px-3 py-2" name="periodEnd" required type="date" />
        </label>
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Reason (at least 8 characters)</span>
          <input className="w-64 rounded-md border border-slate-300 px-3 py-2" name="reason" required placeholder="Month-end provider reconciliation" />
        </label>
        <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} type="submit">
          Open run
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-emerald-700" role="status">{notice}</p> : null}
    </form>
  );
}
