'use client';

import { FormEvent, useEffect, useState } from 'react';

type QuoteValidity = { validityDays: number | null };

export function QuoteValidityEditor({ companyId }: { companyId: string }) {
  const [validity, setValidity] = useState<QuoteValidity | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/quote-validity`, { cache: 'no-store' });
    const body = await response.json() as QuoteValidity & { error?: string };
    if (!response.ok) throw new Error(body.error || 'Unable to load quotation validity.');
    setValidity(body);
  }
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/quote-validity`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as QuoteValidity & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to load quotation validity.');
        if (!cancelled) setValidity(body);
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load quotation validity.'); });
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
        body: JSON.stringify({ key: 'rental.quote_validity', value: Number(form.get('days')), reason: String(form.get('reason') || '') }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save quotation validity.');
      await load();
      setNotice('Quotation validity saved.');
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save quotation validity.');
    } finally { setSaving(false); }
  }

  return <section className="settings-status-panel" aria-labelledby="quote-validity-title">
    <div className="fleet-list-heading"><div>
      <p className="eyebrow">RNT-04</p><h2 id="quote-validity-title">Quotation validity</h2>
      <p className="muted">Set how many whole days a quotation remains valid. No duration is prefilled; an unset or invalid value blocks quotation creation.</p>
    </div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    <p className="setting-status">Current value: {!validity ? 'Loading…' : validity.validityDays === null ? 'Not configured' : `${validity.validityDays} days`}</p>
    <form className="quote-validity-form" onSubmit={(event) => void save(event)}>
      <label htmlFor="quote-validity-days">Validity duration (whole days)<input id="quote-validity-days" name="days" type="number" min="1" step="1" required /></label>
      <label htmlFor="quote-validity-reason">Reason for change<textarea id="quote-validity-reason" name="reason" minLength={8} maxLength={500} required /></label>
      <button className="button-primary" type="submit" disabled={saving || !validity}>{saving ? 'Saving…' : 'Save quotation validity'}</button>
    </form>
  </section>;
}
