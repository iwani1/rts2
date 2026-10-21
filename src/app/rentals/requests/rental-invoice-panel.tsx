'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Invoice = {
  id: string;
  reference: string;
  status: string;
  subtotalPesewas: number;
  taxPesewas: number;
  depositDeductionPesewas: number;
  totalPesewas: number;
  paidPesewas: number;
  outstandingPesewas: number;
  dueDate: string | null;
  lines: Array<{ id: string; description: string; amountPesewas: number }>;
};

function ghs(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

function pesewas(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

export function RentalInvoicePanel({ companyId, requestId }: { companyId: string; requestId: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);

  const requestBase = `/api/companies/${encodeURIComponent(companyId)}/rental-requests/${encodeURIComponent(requestId)}/invoice`;
  const invoiceBase = `/api/companies/${encodeURIComponent(companyId)}/rental-invoices`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(requestBase);
      if (response.ok) setInvoice((await response.json() as { invoice: Invoice | null }).invoice);
    } catch {
      // errors surface on action
    } finally {
      setLoaded(true);
    }
  }, [requestBase]);

  useEffect(() => { void load(); }, [load]);

  async function act(run: () => Promise<Response>, success: string) {
    setError(''); setNotice(''); setPending(true);
    try {
      const response = await run();
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save.');
      setNotice(success);
      await load();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save.');
    } finally { setPending(false); }
  }

  return <section className="vehicle-editor" aria-labelledby="rental-invoice-title">
    <div className="vehicle-editor-heading"><div><p className="eyebrow">Billing</p><h2 id="rental-invoice-title">Rental invoice</h2></div></div>
    {!loaded && <p className="form-help">Loading…</p>}
    {loaded && !invoice && <>
      <p className="form-help">No invoice yet. Finance can create one from the approved completion: quoted amount + approved charges, configured taxes, less the recorded deposit.</p>
      <button className="button-primary" type="button" disabled={pending} onClick={() => void act(
        () => fetch(requestBase, { method: 'POST' }), 'Invoice created (draft).',
      )}>{pending ? 'Working…' : 'Create invoice from completion'}</button>
    </>}
    {invoice && <>
      <p className="form-help">
        {invoice.reference} · {invoice.status}
        {invoice.dueDate ? ` · due ${invoice.dueDate}` : ''}
      </p>
      <ol className="customer-history-list">
        {invoice.lines.map((line) => <li key={line.id}><strong>{ghs(line.amountPesewas)}</strong><span>{line.description}</span></li>)}
        {invoice.taxPesewas > 0 && <li><strong>{ghs(invoice.taxPesewas)}</strong><span>Taxes (configured lines)</span></li>}
        {invoice.depositDeductionPesewas > 0 && <li><strong>−{ghs(invoice.depositDeductionPesewas)}</strong><span>Deposit already received</span></li>}
        <li><strong>{ghs(invoice.totalPesewas)}</strong><span>Total · paid {ghs(invoice.paidPesewas)} · outstanding {ghs(invoice.outstandingPesewas)}</span></li>
      </ol>
      {invoice.status === 'DRAFT' && <form className="vehicle-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void act(() => fetch(`${invoiceBase}/${encodeURIComponent(invoice.id)}/transition`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStatus: 'ISSUED', dueDate: String(form.get('dueDate') ?? ''), reason: String(form.get('issueReason') ?? '') }),
        }), 'Invoice issued.');
      }}>
        <h3>Issue invoice</h3>
        <label>Payment due date<input name="dueDate" type="date" required /></label>
        <label>Reason<input name="issueReason" required minLength={8} maxLength={500} /></label>
        <button className="button-primary" type="submit" disabled={pending}>{pending ? 'Working…' : 'Issue invoice'}</button>
      </form>}
      {invoice.status === 'ISSUED' && <form className="vehicle-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const amount = pesewas(String(form.get('amount') ?? ''));
        if (amount === null) { setError('Enter a payment amount.'); return; }
        void act(() => fetch(`${invoiceBase}/${encodeURIComponent(invoice.id)}/payments`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountPesewas: amount,
            method: String(form.get('method') ?? '') || null,
            reference: String(form.get('paymentReference') ?? '') || null,
            receivedAt: String(form.get('receivedAt') ?? ''),
            reason: String(form.get('paymentReason') ?? ''),
          }),
        }), 'Payment recorded.');
      }}>
        <h3>Record payment</h3>
        <label>Amount (GHS)<input name="amount" inputMode="decimal" required /></label>
        <label>Method<input name="method" maxLength={64} placeholder="MoMo / bank transfer / cash" /></label>
        <label>Payment reference<input name="paymentReference" maxLength={128} /></label>
        <label>Received on<input name="receivedAt" type="date" required /></label>
        <label>Reason<input name="paymentReason" required minLength={8} maxLength={500} /></label>
        <button className="button-primary" type="submit" disabled={pending}>{pending ? 'Working…' : 'Record payment'}</button>
      </form>}
      {(invoice.status === 'DRAFT' || invoice.status === 'ISSUED') && <form className="vehicle-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void act(() => fetch(`${invoiceBase}/${encodeURIComponent(invoice.id)}/transition`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStatus: 'VOID', reason: String(form.get('voidReason') ?? '') }),
        }), 'Invoice voided.');
      }}>
        <h3>Void invoice</h3>
        <label>Reason<input name="voidReason" required minLength={8} maxLength={500} /></label>
        <button className="button-danger" type="submit" disabled={pending}>{pending ? 'Working…' : 'Void invoice'}</button>
      </form>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </section>;
}
