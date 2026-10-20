'use client';

import { FormEvent, useEffect, useState } from 'react';

type TaxLine = { code: string; label: string; rateBasisPoints: number };
type TaxLineDraft = { code: string; label: string; rateBasisPoints: number | null };

export function TaxLinesEditor({ companyId }: { companyId: string }) {
  const [lines, setLines] = useState<TaxLineDraft[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/tax-lines`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { lines: TaxLine[] | null; error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to load tax lines.');
        if (!cancelled) setLines(body.lines ?? []);
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load tax lines.'); });
    return () => { cancelled = true; };
  }, [companyId]);

  function update(index: number, field: keyof TaxLineDraft, value: string) {
    setLines((current) => current?.map((line, i) => i === index
      ? { ...line, [field]: field === 'rateBasisPoints' ? (value.trim() === '' ? null : Math.round(Number(value) * 100)) : value }
      : line) ?? null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(''); setNotice(''); setSaving(true);
    const form = new FormData(formElement);
    try {
      const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'finance.tax_lines', value: lines, reason: String(form.get('reason') || '') }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save tax lines.');
      setNotice('Tax lines saved.');
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save tax lines.');
    } finally { setSaving(false); }
  }

  return <section className="settings-status-panel" aria-labelledby="tax-lines-title">
    <div className="fleet-list-heading"><div><p className="eyebrow">FIN-01 · RNT-04</p><h2 id="tax-lines-title">Tax and levy lines</h2>
      <p className="muted">Record accountant-approved labels and rates as basis points (100 basis points = 1%). This stores policy inputs only; calculation, compounding, exemptions, and application order are not implemented. No lines or rates are prefilled.</p>
    </div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {!lines ? <p role="status">Loading tax lines…</p> : <form onSubmit={(event) => void save(event)}>
      <p className="setting-status">Current state: {lines.length === 0 ? 'Not configured' : `${lines.length} line${lines.length === 1 ? '' : 's'} configured`}</p>
      {lines.length === 0 && <p className="muted">No tax or levy values exist. Add only lines confirmed by the company&apos;s accountant. Saving with no lines clears this configuration.</p>}
      <div className="resource-buffer-grid">{lines.map((line, index) => <fieldset className="resource-buffer-form" key={`${index}-${line.code}`}>
        <legend>Tax or levy line {index + 1}</legend>
        <label htmlFor={`tax-code-${index}`}>Unique code<input id={`tax-code-${index}`} required maxLength={32} pattern="[A-Z0-9_-]{2,32}" value={line.code} onChange={(event) => update(index, 'code', event.target.value)} /></label>
        <label htmlFor={`tax-label-${index}`}>Accountant-approved label<input id={`tax-label-${index}`} required maxLength={100} value={line.label} onChange={(event) => update(index, 'label', event.target.value)} /></label>
        <label htmlFor={`tax-rate-${index}`}>Rate (percent)<input id={`tax-rate-${index}`} type="number" min="0" step="0.01" required value={line.rateBasisPoints === null ? '' : line.rateBasisPoints / 100} onChange={(event) => update(index, 'rateBasisPoints', event.target.value)} /></label>
        <button className="button-secondary" type="button" onClick={() => setLines((current) => current?.filter((_, i) => i !== index) ?? null)}>Remove line</button>
      </fieldset>)}</div>
      <button className="button-secondary" type="button" disabled={lines.length >= 50} onClick={() => setLines((current) => [...(current ?? []), { code: '', label: '', rateBasisPoints: null }])}>Add tax or levy line</button>
      <label htmlFor="tax-lines-reason">Reason for change<textarea id="tax-lines-reason" name="reason" minLength={8} maxLength={500} required /></label>
      <button className="button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save tax lines'}</button>
    </form>}
  </section>;
}
