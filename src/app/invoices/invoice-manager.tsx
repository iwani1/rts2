'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Option = { id: string; label: string };

function readApiError(data: unknown, fallback: string) {
  if (typeof data === 'object' && data !== null) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export function InvoiceManager({
  canManage,
  companyId,
  contracts,
  returnTo,
}: {
  canManage: boolean;
  companyId: string;
  contracts: Option[];
  returnTo: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [contractId, setContractId] = useState('');
  const [periodStart, setPeriodStart] = useState('2027-09-01');
  const [periodEnd, setPeriodEnd] = useState('2027-09-30');
  const [reason, setReason] = useState('');

  const generate = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/companies/${companyId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, periodStart, periodEnd, reason }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(data, 'The invoice could not be generated.'));
      const payload = data as { duplicate?: boolean; invoice?: { reference: string; totalPesewas: number } };
      setMessage(payload.duplicate
        ? `Invoice ${payload.invoice?.reference ?? ''} already exists for this contract and period; returning it unchanged.`
        : `Invoice ${payload.invoice?.reference ?? ''} generated (GH₵ ${((payload.invoice?.totalPesewas ?? 0) / 100).toFixed(2)}).`);
      setReason('');
      router.push(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The invoice could not be generated.');
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-950">Generate an invoice</h2>
      {!canManage ? (
        <p className="mt-2 text-sm text-slate-600">Your invoice access is read-only.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className="grid gap-1 text-sm text-slate-700 md:col-span-2">Contract
              <select className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setContractId(event.target.value)} value={contractId}>
                <option value="">Select contract</option>
                {contracts.map((contract) => (<option key={contract.id} value={contract.id}>{contract.label}</option>))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-700">Period start
              <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setPeriodStart(event.target.value)} type="date" value={periodStart} />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">Period end
              <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setPeriodEnd(event.target.value)} type="date" value={periodEnd} />
            </label>
            <label className="grid gap-1 text-sm text-slate-700 md:col-span-4">Reason (required, min 8 chars)
              <input className="rounded-md border border-slate-300 px-3 py-2" onChange={(event) => setReason(event.target.value)} value={reason} />
            </label>
          </div>
          <button className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy || !contractId} onClick={() => void generate()} type="button">
            Generate invoice
          </button>
          <p className="mt-2 text-xs text-slate-500">
            A contract without a configured corporate rate cannot be invoiced; contact the system administrator.
          </p>
        </>
      )}
      {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-green-700" role="status">{message}</p> : null}
    </section>
  );
}
