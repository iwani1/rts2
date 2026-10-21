'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ExpenseSummary = {
  id: string;
  reference: string;
  recordedById?: string;
};

export default function ExpenseActions({
  companyId,
  categories,
  vehicles,
  decideExpense,
}: {
  companyId: string;
  categories?: string[];
  vehicles?: Array<{ id: string; registrationNumber: string }>;
  decideExpense?: ExpenseSummary;
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

  if (decideExpense) {
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-slate-600">
            <span className="mb-1 block font-medium text-slate-500">Decision reason (required, at least 8 characters)</span>
            <input className="w-64 rounded-md border border-slate-300 px-3 py-2" id={`reason-${decideExpense.id}`} disabled={busy} placeholder="Why is this decided?" />
          </label>
          <button
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void act(
              () => fetch(`/api/companies/${companyId}/expenses/${decideExpense.id}/transition`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ toStatus: 'Approved', reason: (document.getElementById(`reason-${decideExpense.id}`) as HTMLInputElement)?.value ?? '' }),
              }),
              'Expense approved.',
            )}
            type="button"
          >Approve</button>
          <button
            className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void act(
              () => fetch(`/api/companies/${companyId}/expenses/${decideExpense.id}/transition`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ toStatus: 'Rejected', reason: (document.getElementById(`reason-${decideExpense.id}`) as HTMLInputElement)?.value ?? '' }),
              }),
              'Expense rejected.',
            )}
            type="button"
          >Reject</button>
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
        const cedisText = String(form.get('cedis') ?? '').trim();
        const amountPesewas = Math.round(Number(cedisText) * 100);
        if (!Number.isFinite(amountPesewas) || amountPesewas <= 0) {
          setError('Enter an amount in GH₵ greater than zero.');
          return;
        }
        const body: Record<string, unknown> = {
          expenseDate: String(form.get('expenseDate') ?? ''),
          category: String(form.get('category') ?? ''),
          description: String(form.get('description') ?? ''),
          supplier: String(form.get('supplier') ?? '') || undefined,
          method: String(form.get('method') ?? '') || undefined,
          receiptReference: String(form.get('receiptReference') ?? '') || undefined,
          vehicleId: String(form.get('vehicleId') ?? '') || null,
          amountPesewas,
          reason: String(form.get('reason') ?? ''),
        };
        void act(
          () => fetch(`/api/companies/${companyId}/expenses`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
          'Expense recorded as Pending.',
        );
        (event.currentTarget as HTMLFormElement).reset();
      }}
    >
      <h2 className="text-base font-semibold text-slate-950">Record an expense</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Expense date</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="expenseDate" required type="date" />
        </label>
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Category</span>
          <select className="w-full rounded-md border border-slate-300 px-3 py-2" name="category" required>
            <option value="">Choose</option>
            {(categories ?? []).map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Amount (GH₵)</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" inputMode="decimal" name="cedis" placeholder="e.g. 450.00" required />
        </label>
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Vehicle (optional)</span>
          <select className="w-full rounded-md border border-slate-300 px-3 py-2" name="vehicleId">
            <option value="">Not vehicle-specific</option>
            {(vehicles ?? []).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registrationNumber}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-600 sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-500">Description</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="description" required />
        </label>
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Supplier</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="supplier" />
        </label>
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Payment method</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="method" placeholder="cash, MoMo, transfer…" />
        </label>
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Receipt reference</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="receiptReference" placeholder="Receipt number or where the receipt is filed" />
        </label>
        <label className="text-sm text-slate-600 sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-500">Reason for recording (required, at least 8 characters)</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="reason" required />
        </label>
      </div>
      <button className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} type="submit">
        Record expense
      </button>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-emerald-700" role="status">{notice}</p> : null}
    </form>
  );
}
