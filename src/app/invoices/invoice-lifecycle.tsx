'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type InvoiceSummary = {
  id: string;
  reference: string;
  status: string;
  totalPesewas: number;
  paidPesewas: number;
  outstandingPesewas: number;
  dueDate: string | null;
};

type HistoryEntry = {
  sequence: number;
  fromStatus: string | null;
  toStatus: string;
  reason: string;
  actorName: string;
  createdAt: string;
};

type PaymentEntry = {
  id: string;
  amountPesewas: number;
  method: string | null;
  reference: string | null;
  receivedAt: string;
  reason: string;
  recordedByName: string;
  createdAt: string;
};

function readApiError(data: unknown, fallback: string) {
  if (typeof data === 'object' && data !== null) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

const inputClass = 'rounded-md border border-slate-300 px-3 py-2';

export function InvoiceLifecycle({
  canManage,
  companyId,
  invoice,
  history,
  payments,
  returnTo,
}: {
  canManage: boolean;
  companyId: string;
  invoice: InvoiceSummary;
  history: HistoryEntry[];
  payments: PaymentEntry[];
  returnTo: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [transitionReason, setTransitionReason] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentReason, setPaymentReason] = useState('');

  const done = (text: string) => {
    setMessage(text);
    router.push(returnTo);
    router.refresh();
  };

  const transition = async (toStatus: 'ISSUED' | 'PAID' | 'VOID') => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/invoices/${invoice.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatus, reason: transitionReason, ...(toStatus === 'ISSUED' ? { dueDate: dueDate || null } : {}) }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(data, 'The invoice status could not be changed.'));
      setTransitionReason('');
      done(`Invoice ${invoice.reference} is now ${toStatus}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The invoice status could not be changed.');
    } finally { setBusy(false); }
  };

  const recordPayment = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const amountPesewas = Math.round(Number(amount) * 100);
      if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
        throw new Error('Enter a payment amount greater than zero.');
      }
      const response = await fetch(`/api/companies/${companyId}/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountPesewas,
          method: method.trim() ? method.trim() : null,
          reference: paymentReference.trim() ? paymentReference.trim() : null,
          receivedAt,
          reason: paymentReason,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(data, 'The payment could not be recorded.'));
      const payload = data as { outstandingPesewas?: number; invoice?: { status?: string } };
      setAmount(''); setPaymentReference(''); setPaymentReason('');
      done(payload.invoice?.status === 'PAID'
        ? `Payment recorded; invoice ${invoice.reference} is fully paid.`
        : `Payment recorded; ${cedis(payload.outstandingPesewas ?? 0)} remains outstanding.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The payment could not be recorded.');
    } finally { setBusy(false); }
  };

  const terminal = invoice.status === 'PAID' || invoice.status === 'VOID';

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <h3 className="text-base font-semibold text-slate-950">Lifecycle, payments and history</h3>
      <dl className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
        <div><dt className="font-medium text-slate-500">Status</dt><dd>{invoice.status}</dd></div>
        <div><dt className="font-medium text-slate-500">Paid</dt><dd>{cedis(invoice.paidPesewas)}</dd></div>
        <div><dt className="font-medium text-slate-500">Outstanding</dt><dd>{cedis(invoice.outstandingPesewas)}</dd></div>
        <div><dt className="font-medium text-slate-500">Due date</dt><dd>{invoice.dueDate ?? 'Not recorded'}</dd></div>
      </dl>

      {!canManage ? (
        <p className="mt-3 text-sm text-slate-600">Your invoice access is read-only.</p>
      ) : terminal ? (
        <p className="mt-3 text-sm text-slate-600">
          This invoice is {invoice.status} and can no longer change. Payments and history below are append-only.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Change status</h4>
            <label className="mt-2 grid gap-1 text-sm text-slate-700">Reason (required, min 8 chars)
              <input className={inputClass} onChange={(event) => setTransitionReason(event.target.value)} value={transitionReason} />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {invoice.status === 'DRAFT' ? (
                <label className="mt-2 grid gap-1 text-sm text-slate-700">Payment due date (required to issue)
                  <input className={inputClass} type="date" onChange={(event) => setDueDate(event.target.value)} value={dueDate} />
                </label>
              ) : null}
              {invoice.status === 'DRAFT' ? (
                <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy || transitionReason.trim().length < 8 || !dueDate} onClick={() => void transition('ISSUED')} type="button">
                  Issue invoice
                </button>
              ) : null}
              {invoice.status === 'ISSUED' ? (
                <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy || transitionReason.trim().length < 8} onClick={() => void transition('PAID')} type="button">
                  Mark paid without a payment record
                </button>
              ) : null}
              <button className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50" disabled={busy || transitionReason.trim().length < 8 || (invoice.status === 'ISSUED' && payments.length > 0)} onClick={() => void transition('VOID')} type="button">
                Void invoice
              </button>
            </div>
            {invoice.status === 'ISSUED' && payments.length > 0 ? (
              <p className="mt-2 text-xs text-slate-500">Voiding is unavailable once payments exist; payments are append-only.</p>
            ) : null}
            {invoice.status === 'DRAFT' ? (
              <p className="mt-2 text-xs text-slate-500">Voiding a draft releases its trips so they can be billed again.</p>
            ) : null}
          </div>

          {invoice.status === 'ISSUED' ? (
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Record a payment</h4>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm text-slate-700">Amount (GH₵)
                  <input className={inputClass} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="0.00" value={amount} />
                </label>
                <label className="grid gap-1 text-sm text-slate-700">Received on
                  <input className={inputClass} onChange={(event) => setReceivedAt(event.target.value)} type="date" value={receivedAt} />
                </label>
                <label className="grid gap-1 text-sm text-slate-700">Method
                  <input className={inputClass} onChange={(event) => setMethod(event.target.value)} placeholder="Bank transfer, MoMo, cash…" value={method} />
                </label>
                <label className="grid gap-1 text-sm text-slate-700">External reference
                  <input className={inputClass} onChange={(event) => setPaymentReference(event.target.value)} value={paymentReference} />
                </label>
                <label className="grid gap-1 text-sm text-slate-700 sm:col-span-2">Reason (required, min 8 chars)
                  <input className={inputClass} onChange={(event) => setPaymentReason(event.target.value)} value={paymentReason} />
                </label>
              </div>
              <button className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy || paymentReason.trim().length < 8} onClick={() => void recordPayment()} type="button">
                Record payment
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Payments cannot exceed the outstanding balance; the invoice becomes PAID when the balance reaches zero.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-green-700" role="status">{message}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Payments</h4>
          {payments.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No payments recorded yet.</p>
          ) : (
            <table className="mt-2 w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr><th className="py-2 pr-3 font-medium">Received</th><th className="py-2 pr-3 font-medium">Amount</th><th className="py-2 pr-3 font-medium">Method</th><th className="py-2 font-medium">Recorded by</th></tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr className="border-t border-slate-100" key={payment.id}>
                    <td className="py-2 pr-3">{payment.receivedAt}</td>
                    <td className="py-2 pr-3">{cedis(payment.amountPesewas)}</td>
                    <td className="py-2 pr-3">{payment.method ?? '—'}{payment.reference ? ` (${payment.reference})` : ''}</td>
                    <td className="py-2">{payment.recordedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Status history</h4>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No history recorded yet.</p>
          ) : (
            <ol className="mt-2 grid gap-2 text-sm text-slate-700">
              {history.map((entry) => (
                <li className="border-t border-slate-100 pt-2" key={entry.sequence}>
                  <span className="font-medium text-slate-900">{entry.fromStatus ?? '—'} → {entry.toStatus}</span>
                  {' '}by {entry.actorName} on {entry.createdAt.slice(0, 10)} — {entry.reason}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
