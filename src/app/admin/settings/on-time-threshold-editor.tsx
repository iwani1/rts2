'use client';

import { FormEvent, useEffect, useState } from 'react';

type OnTimeThreshold = { thresholdMinutes: number | null };

export function OnTimeThresholdEditor({ companyId }: { companyId: string }) {
  const [threshold, setThreshold] = useState<OnTimeThreshold | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/on-time-threshold`, { cache: 'no-store' });
    const body = await response.json() as OnTimeThreshold & { error?: string };
    if (!response.ok) throw new Error(body.error || 'Unable to load on-time threshold.');
    setThreshold(body);
  }
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/on-time-threshold`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as OnTimeThreshold & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to load on-time threshold.');
        if (!cancelled) setThreshold(body);
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load on-time threshold.'); });
    return () => { cancelled = true; };
  }, [companyId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError(''); setNotice(''); setSaving(true);
    try {
      const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'reports.on_time_threshold', value: Number(form.get('minutes')), reason: String(form.get('reason') || '') }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save on-time threshold.');
      await load();
      setNotice('On-time threshold saved.');
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save on-time threshold.');
    } finally { setSaving(false); }
  }

  return <section className="settings-status-panel" aria-labelledby="on-time-threshold-title">
    <div className="fleet-list-heading"><div>
      <p className="eyebrow">RPT-02</p><h2 id="on-time-threshold-title">On-time reporting threshold</h2>
      <p className="muted">Set how many minutes after the planned start a boarding still counts as on time. No value is prefilled; while unset, staff-transport reports publish average delay and coverage but no on-time rate. The owner-approved value is 10 minutes (D-078).</p>
    </div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    <p className="setting-status">Current value: {!threshold ? 'Loading…' : threshold.thresholdMinutes === null ? 'Not configured' : `${threshold.thresholdMinutes} minutes`}</p>
    <form className="quote-validity-form" onSubmit={(event) => void save(event)}>
      <label htmlFor="on-time-threshold-minutes">Threshold (whole minutes, 1–120)<input id="on-time-threshold-minutes" name="minutes" type="number" min="1" max="120" step="1" required /></label>
      <label htmlFor="on-time-threshold-reason">Reason for change<textarea id="on-time-threshold-reason" name="reason" minLength={8} maxLength={500} required /></label>
      <button className="button-primary" type="submit" disabled={saving || !threshold}>{saving ? 'Saving…' : 'Save on-time threshold'}</button>
    </form>
  </section>;
}
