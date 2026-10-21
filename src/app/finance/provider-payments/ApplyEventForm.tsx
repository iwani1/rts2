'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ApplyEventForm({
  companyId,
  eventId,
  invoices,
}: {
  companyId: string;
  eventId: string;
  invoices: Array<{ id: string; reference: string; outstandingPesewas: number }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setError(null);
        setNotice(null);
        void fetch(`/api/companies/${companyId}/payments/provider-events/${eventId}/apply`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            invoiceId: String(form.get('invoiceId') ?? ''),
            reason: String(form.get('reason') ?? ''),
          }),
        }).then(async (response) => {
          const body = await response.json() as { message?: string; error?: string };
          if (!response.ok) {
            setError(body.message ?? body.error ?? 'The application did not complete.');
            return;
          }
          setNotice('Provider payment applied to the invoice.');
          router.refresh();
        }).catch(() => setError('The application did not complete.'))
          .finally(() => setBusy(false));
      }}
    >
      <label className="text-sm text-slate-600">
        <span className="mb-1 block font-medium text-slate-500">Apply to issued invoice</span>
        <select className="rounded-md border border-slate-300 px-3 py-2" name="invoiceId" required>
          <option value="">Choose</option>
          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.reference} — GH₵ {(invoice.outstandingPesewas / 100).toFixed(2)} outstanding
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-slate-600">
        <span className="mb-1 block font-medium text-slate-500">Reason (at least 8 characters)</span>
        <input className="w-56 rounded-md border border-slate-300 px-3 py-2" name="reason" required placeholder="Verified against provider dashboard" />
      </label>
      <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} type="submit">
        Apply payment
      </button>
      {error ? <p className="w-full text-sm text-red-700" role="alert">{error}</p> : null}
      {notice ? <p className="w-full text-sm text-emerald-700" role="status">{notice}</p> : null}
    </form>
  );
}
