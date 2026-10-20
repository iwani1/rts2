'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { RentalPricingModel } from '@/modules/settings/registry';

type PricingModelDraft = Omit<RentalPricingModel, 'unit'> & { unit: RentalPricingModel['unit'] | '' };
const units: Array<{ value: RentalPricingModel['unit']; label: string }> = [
  { value: 'PER_TRIP', label: 'Per trip' }, { value: 'PER_DAY', label: 'Per day' },
  { value: 'PER_HOUR', label: 'Per hour' }, { value: 'PER_KM', label: 'Per kilometre' },
];

export function PricingModelsEditor({ companyId }: { companyId: string }) {
  const [models, setModels] = useState<PricingModelDraft[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/pricing-models`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { models: RentalPricingModel[] | null; error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to load pricing models.');
        if (!cancelled) setModels(body.models ?? []);
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load pricing models.'); });
    return () => { cancelled = true; };
  }, [companyId]);

  function update(index: number, field: keyof PricingModelDraft, value: string) {
    setModels((current) => current?.map((model, i) => i === index
      ? { ...model, [field]: field === 'ratePesewas' ? Number(value) : value }
      : model) ?? null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(''); setNotice(''); setSaving(true);
    const form = new FormData(formElement);
    try {
      const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'rental.pricing_models', value: models, reason: String(form.get('reason') || '') }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save pricing models.');
      setNotice('Pricing models saved.');
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save pricing models.');
    } finally { setSaving(false); }
  }

  return <section className="settings-status-panel" aria-labelledby="pricing-models-title">
    <div className="fleet-list-heading"><div><p className="eyebrow">RNT-04</p><h2 id="pricing-models-title">Rental pricing models</h2>
      <p className="muted">Enter operator-approved rates in GHS pesewas. These are configuration records only; this editor does not calculate or issue quotations. No models or rates are prefilled.</p>
    </div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {!models ? <p role="status">Loading pricing models…</p> : <form onSubmit={(event) => void save(event)}>
      <p className="setting-status">Current state: {models.length === 0 ? 'Not configured' : `${models.length} model${models.length === 1 ? '' : 's'} configured`}</p>
      {models.length === 0 && <p className="muted">No rates exist yet. Add a pricing line only after the operator approves its rate and basis. Saving with no lines clears the configuration and keeps quotation pricing unconfigured.</p>}
      <div className="resource-buffer-grid">{models.map((model, index) => <fieldset className="resource-buffer-form" key={`${index}-${model.code}`}>
        <legend>Pricing line {index + 1}</legend>
        <label htmlFor={`pricing-code-${index}`}>Unique code<input id={`pricing-code-${index}`} required maxLength={32} pattern="[A-Z0-9_-]{2,32}" value={model.code} onChange={(event) => update(index, 'code', event.target.value)} /></label>
        <label htmlFor={`pricing-label-${index}`}>Operator-facing label<input id={`pricing-label-${index}`} required maxLength={100} value={model.label} onChange={(event) => update(index, 'label', event.target.value)} /></label>
        <label htmlFor={`pricing-unit-${index}`}>Charging basis<select id={`pricing-unit-${index}`} required value={model.unit} onChange={(event) => update(index, 'unit', event.target.value)}><option value="">Select a basis</option>{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
        <label htmlFor={`pricing-rate-${index}`}>Rate (GHS pesewas)<input id={`pricing-rate-${index}`} type="number" min="1" step="1" required value={model.ratePesewas || ''} onChange={(event) => update(index, 'ratePesewas', event.target.value)} /></label>
        <button className="button-secondary" type="button" onClick={() => setModels((current) => current?.filter((_, i) => i !== index) ?? null)}>Remove line</button>
      </fieldset>)}</div>
      <button className="button-secondary" type="button" disabled={models.length >= 50} onClick={() => setModels((current) => [...(current ?? []), { code: '', label: '', unit: '', ratePesewas: 0 }])}>Add pricing line</button>
      <label htmlFor="pricing-models-reason">Reason for change<textarea id="pricing-models-reason" name="reason" minLength={8} maxLength={500} required /></label>
      <button className="button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save pricing models'}</button>
    </form>}
  </section>;
}
