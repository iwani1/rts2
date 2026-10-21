'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { CorporateRate } from '@/modules/settings/registry';

type ContractOption = { id: string; label: string };
type RateDraft = CorporateRate;

const unitOptions: Array<{ value: CorporateRate['unit']; label: string }> = [
  { value: 'PER_TRIP', label: 'Per completed trip' },
  { value: 'PER_PASSENGER', label: 'Per completed passenger journey' },
];

/**
 * FIN-02 (D-090/5C): corporate invoice generation reads these operator-
 * approved per-contract rates. Values are entered here explicitly with an
 * audit reason; nothing is prefilled or derived. Saving an empty list
 * clears the configuration and returns invoicing to its honest
 * unconfigured state.
 */
export function CorporateRatesEditor({ companyId }: { companyId: string }) {
  const [rates, setRates] = useState<RateDraft[] | null>(null);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/corporate-rates`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { rates: CorporateRate[] | null; contracts: ContractOption[]; error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to load corporate rates.');
        if (!cancelled) {
          setRates(body.rates ?? []);
          setContracts(body.contracts ?? []);
        }
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load corporate rates.'); });
    return () => { cancelled = true; };
  }, [companyId]);

  function update(index: number, field: keyof RateDraft, value: string) {
    setRates((current) => current?.map((rate, i) => (i === index
      ? { ...rate, [field]: field === 'ratePesewas' ? Number(value) : value }
      : rate)) ?? null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'finance.corporate_rates', value: rates ?? [], reason: String(form.get('reason') || '') }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save corporate rates.');
      setNotice('Corporate rates saved.');
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save corporate rates.');
    } finally { setSaving(false); }
  }

  return <section className="settings-status-panel" aria-labelledby="corporate-rates-title">
    <div className="fleet-list-heading"><div>
      <p className="eyebrow">FIN-02</p><h2 id="corporate-rates-title">Corporate contract rates</h2>
      <p className="muted">Enter one operator-approved rate per contract in GHS pesewas. Corporate invoice generation reads these rates; without them generation reports &ldquo;Not configured&rdquo; and creates nothing. Each contract may appear once.</p>
    </div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {!rates ? <p role="status">Loading corporate rates…</p> : <form onSubmit={(event) => void save(event)}>
      <p className="setting-status">Current state: {rates.length === 0 ? 'Not configured' : `${rates.length} rate${rates.length === 1 ? '' : 's'} configured`}</p>
      {contracts.length === 0 && <p className="muted">No contracts exist in this company yet; create a contract before entering its rate.</p>}
      {rates.map((rate, index) => <fieldset className="resource-buffer-form" key={index}>
        <legend>Rate line {index + 1}</legend>
        <label htmlFor={`corporate-rate-contract-${index}`}>Contract
          <select id={`corporate-rate-contract-${index}`} required value={rate.contractId} onChange={(event) => update(index, 'contractId', event.target.value)}>
            <option value="">Select a contract</option>
            {contracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.label}</option>)}
          </select>
        </label>
        <label htmlFor={`corporate-rate-unit-${index}`}>Charging basis
          <select id={`corporate-rate-unit-${index}`} required value={rate.unit} onChange={(event) => update(index, 'unit', event.target.value)}>
            <option value="">Select a basis</option>
            {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
          </select>
        </label>
        <label htmlFor={`corporate-rate-rate-${index}`}>Rate (GHS pesewas)
          <input id={`corporate-rate-rate-${index}`} type="number" min="1" step="1" required value={rate.ratePesewas || ''} onChange={(event) => update(index, 'ratePesewas', event.target.value)} />
        </label>
        <button className="button-secondary" type="button" onClick={() => setRates((current) => current?.filter((_, i) => i !== index) ?? null)}>Remove line</button>
      </fieldset>)}
      <div className="resource-buffer-actions">
        <button className="button-secondary" type="button" disabled={contracts.length === 0} onClick={() => setRates((current) => [...(current ?? []), { contractId: '', unit: '' as RateDraft['unit'], ratePesewas: 0 }])}>Add rate line</button>
      </div>
      <label htmlFor="corporate-rates-reason">Reason for change
        <textarea id="corporate-rates-reason" name="reason" minLength={8} maxLength={500} required />
      </label>
      <button className="button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save corporate rates'}</button>
    </form>}
  </section>;
}
