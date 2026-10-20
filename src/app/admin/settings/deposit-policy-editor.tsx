'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { DepositPolicy } from '@/modules/settings/registry';

type Kind = '' | DepositPolicy['kind'];
type Stage = '' | 'BEFORE_CONFIRMATION' | 'BEFORE_DEPARTURE';
type DepositDraft = { kind: Kind; amount: string; stage: Stage };

function toDraft(policy: DepositPolicy | null): DepositDraft {
  if (!policy) return { kind: '', amount: '', stage: '' };
  if (policy.kind === 'NOT_REQUIRED') return { kind: policy.kind, amount: '', stage: '' };
  return policy.kind === 'FIXED_AMOUNT'
    ? { kind: policy.kind, amount: String(policy.amountPesewas), stage: policy.collectionStage }
    : { kind: policy.kind, amount: String(policy.rateBasisPoints / 100), stage: policy.collectionStage };
}

export function DepositPolicyEditor({ companyId }: { companyId: string }) {
  const [draft, setDraft] = useState<DepositDraft | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/deposit-policy`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { policy: DepositPolicy | null; error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to load deposit policy.');
        if (!cancelled) setDraft(toDraft(body.policy));
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load deposit policy.'); });
    return () => { cancelled = true; };
  }, [companyId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!draft?.kind) return;
    const value = draft.kind === 'NOT_REQUIRED'
      ? { kind: 'NOT_REQUIRED' }
      : draft.kind === 'FIXED_AMOUNT'
        ? { kind: draft.kind, amountPesewas: Number(data.get('amount')), collectionStage: data.get('stage') }
        : { kind: draft.kind, rateBasisPoints: Math.round(Number(data.get('amount')) * 100), collectionStage: data.get('stage') };
    setError(''); setNotice(''); setSaving(true);
    try {
      const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'rental.deposit_policy', value, reason: String(data.get('reason') || '') }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save deposit policy.');
      setNotice('Deposit policy saved.');
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save deposit policy.');
    } finally { setSaving(false); }
  }

  return <section className="settings-status-panel" aria-labelledby="deposit-policy-title">
    <div className="fleet-list-heading"><div><p className="eyebrow">RNT-04 · RNT-05</p><h2 id="deposit-policy-title">Rental deposit policy</h2>
      <p className="muted">Choose an explicit fixed GHS-pesewa amount, percentage, or no-deposit policy, and when a required deposit is due. This records policy only: it does not calculate a quote, accept payment, or verify that funds were received. No choice is preselected.</p>
    </div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {!draft ? <p role="status">Loading deposit policy…</p> : <form onSubmit={(event) => void save(event)}>
      <p className="setting-status">Current state: {!draft.kind ? 'Not configured' : draft.kind === 'NOT_REQUIRED' ? 'No deposit required' : draft.kind === 'FIXED_AMOUNT' ? `Fixed amount: ${draft.amount} GHS pesewas` : `Percentage: ${draft.amount}%`}</p>
      <label htmlFor="deposit-kind">Deposit requirement<select id="deposit-kind" required value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as Kind, amount: '', stage: '' })}>
        <option value="">Select a policy</option><option value="FIXED_AMOUNT">Fixed amount</option><option value="PERCENTAGE">Percentage</option><option value="NOT_REQUIRED">No deposit required</option>
      </select></label>
      {(draft.kind === 'FIXED_AMOUNT' || draft.kind === 'PERCENTAGE') && <>
        <label htmlFor="deposit-amount">{draft.kind === 'FIXED_AMOUNT' ? 'Deposit amount (GHS pesewas)' : 'Deposit rate (percent)'}<input id="deposit-amount" name="amount" type="number" min={draft.kind === 'FIXED_AMOUNT' ? '1' : '0.01'} step={draft.kind === 'FIXED_AMOUNT' ? '1' : '0.01'} required value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
        <label htmlFor="deposit-stage">Deposit due<select id="deposit-stage" name="stage" required value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value as Stage })}>
          <option value="">Select when it is due</option><option value="BEFORE_CONFIRMATION">Before confirmation</option><option value="BEFORE_DEPARTURE">Before departure</option>
        </select></label>
      </>}
      <label htmlFor="deposit-reason">Reason for change<textarea id="deposit-reason" name="reason" minLength={8} maxLength={500} required /></label>
      <button className="button-primary" type="submit" disabled={saving || !draft.kind}>{saving ? 'Saving…' : 'Save deposit policy'}</button>
    </form>}
  </section>;
}
