'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = await response.json() as { message?: string; error?: string };
  if (!response.ok) throw new Error(parsed.message ?? parsed.error ?? 'The action did not complete.');
  return parsed;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The action did not complete.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, notice, act };
}

export function RuleDecisionActions({ companyId, ruleId, status }: { companyId: string; ruleId: string; status: string }) {
  const { busy, error, notice, act } = useAction();
  const decide = (toStatus: string) => {
    const reason = (document.getElementById(`rule-reason-${ruleId}`) as HTMLInputElement)?.value ?? '';
    void act(
      () => postJson(`/api/companies/${companyId}/pay-rules/${ruleId}/transition`, { toStatus, reason }),
      `Rule moved to ${toStatus}.`,
    );
  };
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Reason (at least 8 characters)</span>
          <input className="w-56 rounded-md border border-slate-300 px-3 py-2" disabled={busy} id={`rule-reason-${ruleId}`} placeholder="Decision reason" />
        </label>
        {status === 'DRAFT' ? (
          <button className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} onClick={() => decide('ACTIVE')} type="button">Activate</button>
        ) : null}
        {status !== 'RETIRED' ? (
          <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={busy} onClick={() => decide('RETIRED')} type="button">Retire</button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-emerald-700" role="status">{notice}</p> : null}
    </div>
  );
}

export function CreateRuleForm({ companyId }: { companyId: string }) {
  const { busy, error, notice, act } = useAction();
  return (
    <form
      className="mt-6 rounded-lg border border-slate-200 px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const rate = Math.round(Number(String(form.get('cedis') ?? '')) * 100);
        if (!Number.isFinite(rate) || rate <= 0) return;
        const threshold = String(form.get('overtimeThreshold') ?? '').trim();
        const overtimeRate = String(form.get('overtimeCedis') ?? '').trim();
        const body: Record<string, unknown> = {
          name: String(form.get('name') ?? ''),
          basis: String(form.get('basis') ?? ''),
          ratePesewas: rate,
          effectiveFrom: String(form.get('effectiveFrom') ?? ''),
          effectiveTo: String(form.get('effectiveTo') ?? '') || null,
          overtimeThresholdMinutesPerDay: threshold ? Number(threshold) : null,
          overtimeRatePesewasPerHour: overtimeRate ? Math.round(Number(overtimeRate) * 100) : null,
          reason: String(form.get('reason') ?? ''),
        };
        void act(() => postJson(`/api/companies/${companyId}/pay-rules`, body), 'Pay rule drafted. It pays nobody until another authorised user activates it.');
      }}
    >
      <h2 className="text-base font-semibold text-slate-950">Draft a pay rule</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Rule name</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="name" required /></label>
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Basis</span>
          <select className="w-full rounded-md border border-slate-300 px-3 py-2" name="basis" required>
            <option value="">Choose</option>
            <option value="PER_COMPLETED_TRIP">Per completed trip</option>
            <option value="PER_BOARDING">Per completed boarding</option>
            <option value="FLAT_PER_DAY">Flat per active day</option>
          </select></label>
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Rate (GH₵ per unit)</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" inputMode="decimal" name="cedis" required /></label>
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Effective from</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="effectiveFrom" required type="date" /></label>
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Effective to (optional)</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="effectiveTo" type="date" /></label>
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Overtime: minutes/day threshold (optional)</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" inputMode="numeric" name="overtimeThreshold" placeholder="e.g. 600" /></label>
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Overtime: rate GH₵/hour (with threshold)</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" inputMode="decimal" name="overtimeCedis" /></label>
        <label className="text-sm text-slate-600 sm:col-span-2"><span className="mb-1 block font-medium text-slate-500">Reason (at least 8 characters)</span>
          <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="reason" required /></label>
      </div>
      <button className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} type="submit">Draft rule</button>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-emerald-700" role="status">{notice}</p> : null}
    </form>
  );
}

export function CreateRunForm({ companyId, activeRules }: { companyId: string; activeRules: Array<{ id: string; reference: string; name: string }> }) {
  const { busy, error, notice, act } = useAction();
  return (
    <form
      className="mt-6 rounded-lg border border-slate-200 px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void act(
          () => postJson(`/api/companies/${companyId}/payroll-runs`, {
            ruleId: String(form.get('ruleId') ?? ''),
            periodStart: String(form.get('periodStart') ?? ''),
            periodEnd: String(form.get('periodEnd') ?? ''),
            reason: String(form.get('reason') ?? ''),
          }),
          'Payroll run opened with computed lines.',
        );
      }}
    >
      <h2 className="text-base font-semibold text-slate-950">Open a payroll run</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Active pay rule</span>
          <select className="rounded-md border border-slate-300 px-3 py-2" name="ruleId" required>
            <option value="">Choose</option>
            {activeRules.map((rule) => <option key={rule.id} value={rule.id}>{rule.reference} — {rule.name}</option>)}
          </select></label>
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Period start</span>
          <input className="rounded-md border border-slate-300 px-3 py-2" name="periodStart" required type="date" /></label>
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Period end</span>
          <input className="rounded-md border border-slate-300 px-3 py-2" name="periodEnd" required type="date" /></label>
        <label className="text-sm text-slate-600"><span className="mb-1 block font-medium text-slate-500">Reason</span>
          <input className="w-56 rounded-md border border-slate-300 px-3 py-2" name="reason" required /></label>
        <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} type="submit">Open run</button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-emerald-700" role="status">{notice}</p> : null}
    </form>
  );
}

export function FinaliseRunActions({ companyId, runId }: { companyId: string; runId: string }) {
  const { busy, error, notice, act } = useAction();
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-slate-600">
          <span className="mb-1 block font-medium text-slate-500">Finalise reason (at least 8 characters)</span>
          <input className="w-56 rounded-md border border-slate-300 px-3 py-2" disabled={busy} id={`run-reason-${runId}`} placeholder="Payroll reviewed and approved" />
        </label>
        <button
          className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void act(
            () => postJson(`/api/companies/${companyId}/payroll-runs/${runId}/transition`, {
              toStatus: 'FINAL',
              reason: (document.getElementById(`run-reason-${runId}`) as HTMLInputElement)?.value ?? '',
            }),
            'Payroll run finalised. The CSV export is now available.',
          )}
          type="button"
        >Finalise</button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-emerald-700" role="status">{notice}</p> : null}
    </div>
  );
}
