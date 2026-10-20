'use client';

import { FormEvent, useState } from 'react';
import { accraLocalDateTimeToISOString, formatAccraDateTime } from '@/modules/time/accra-date-time';
import { useRouter } from 'next/navigation';

type ActiveBlock = { id: string; status: string; appliedAt: Date | string } | null;

export function SafetyBlockControls({ companyId, vehicleId, activeBlock }: {
  companyId: string; vehicleId: string; activeBlock: ActiveBlock;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'apply' | 'release' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(vehicleId)}/safety-blocks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: values.get('status'), reason: String(values.get('reason') ?? '').trim() }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to apply safety block.');
      setNotice('Safety block applied. Vehicle status is blocked pending authorized release.');
      setMode(null); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to apply safety block.'); }
    finally { setBusy(false); }
  }

  async function release(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError(''); setNotice('');
    try {
      const workCompletedAt = accraLocalDateTimeToISOString(String(values.get('workCompletedAt') ?? ''));
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/vehicles/${encodeURIComponent(vehicleId)}/safety-blocks/${encodeURIComponent(activeBlock?.id ?? '')}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workCompletedAt, inspectionResults: String(values.get('inspectionResults') ?? '').trim(),
          inspectionPassed: values.get('inspectionPassed') === 'on', reason: String(values.get('reason') ?? '').trim(),
        }),
      });
      const body = await response.json() as { error?: string; block?: { releasedAt?: string } };
      if (!response.ok) throw new Error(body.error || 'Unable to release safety block.');
      const releasedAt = body.block?.releasedAt ? new Date(body.block.releasedAt) : null;
      const releaseTime = releasedAt && Number.isFinite(releasedAt.getTime()) ? ` at ${formatAccraDateTime(releasedAt)}` : '';
      setNotice(`Inspection and work completion recorded; safety block released${releaseTime}.`);
      setMode(null); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to release safety block.'); }
    finally { setBusy(false); }
  }

  return <div className="safety-block-controls">
    {activeBlock ? <>
      <strong className="safety-block-status">Blocked: {activeBlock.status}</strong>
      <span className="vehicle-secondary">Applied {formatAccraDateTime(activeBlock.appliedAt)}</span>
      {mode !== 'release' ? <button className="button-link" type="button" onClick={() => { setError(''); setMode('release'); }}>Record inspection and release</button> : <form onSubmit={(event) => void release(event)}>
        <label>Work completed at<input type="datetime-local" name="workCompletedAt" step="0.001" required /></label>
        <label>Inspection results<textarea name="inspectionResults" minLength={8} maxLength={4000} required /></label>
        <label className="consent-check"><input type="checkbox" name="inspectionPassed" required />I confirm the inspection passed and this vehicle is safe to return to service.</label>
        <label>Release reason<textarea name="reason" minLength={8} maxLength={500} required /></label>
        <button className="button-primary" type="submit" disabled={busy}>{busy ? 'Releasing…' : 'Record inspection and release'}</button>
        <button className="button-link" type="button" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
      </form>}
    </> : mode !== 'apply' ? <button className="button-link" type="button" onClick={() => { setError(''); setMode('apply'); }}>Apply safety block</button> : <form onSubmit={(event) => void apply(event)}>
      <label>Safety status<select name="status" required defaultValue=""><option value="">Choose status</option><option>Under Maintenance</option><option>Out of Service</option><option>Pending Inspection</option></select></label>
      <label>Reason for immediate block<textarea name="reason" minLength={8} maxLength={500} required /></label>
      <button className="button-primary" type="submit" disabled={busy}>{busy ? 'Applying…' : 'Apply safety block'}</button>
      <button className="button-link" type="button" disabled={busy} onClick={() => setMode(null)}>Cancel</button>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
  </div>;
}
