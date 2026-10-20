'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { RentalPricingModel } from '@/modules/settings/registry';

type Preview = {
  lines: Array<{ lineId: string; modelCode: string; label: string; unit: RentalPricingModel['unit']; ratePesewas: number; amountPesewas: number }>;
  subtotalPesewas: number;
};
type Worksheet = { id: string; version: number; preTaxSubtotalPesewas: number };
type WorksheetLineSnapshot = { lineId: string; modelCode: string; label: string; unit: string; ratePesewas: number; amountPesewas: number; quantity: { distanceMetres?: number; durationMinutes?: number } };
type WorksheetHistoryItem = Worksheet & { reason: string; createdAt: string; lines: WorksheetLineSnapshot[] };
type ResponseBody = { models?: RentalPricingModel[] | null; preview?: Preview; worksheet?: Worksheet; worksheets?: WorksheetHistoryItem[]; disclaimer?: string; error?: string };

const unitLabels: Record<RentalPricingModel['unit'], string> = {
  PER_TRIP: 'per trip', PER_DAY: 'per elapsed 24 hours', PER_HOUR: 'per hour', PER_KM: 'per kilometre',
};
const formatMoney = (pesewas: number) => `GHS ${(pesewas / 100).toFixed(2)}`;

export function RentalPricingPreview({ companyId, requestId }: { companyId: string; requestId: string }) {
  const [models, setModels] = useState<RentalPricingModel[] | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [distanceMetres, setDistanceMetres] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [disclaimer, setDisclaimer] = useState('');
  const [reason, setReason] = useState('');
  const [savedWorksheet, setSavedWorksheet] = useState<Worksheet | null>(null);
  const [worksheetHistory, setWorksheetHistory] = useState<WorksheetHistoryItem[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const endpoint = `/api/companies/${encodeURIComponent(companyId)}/rental-requests/${encodeURIComponent(requestId)}/pricing-preview`;
  useEffect(() => {
    let cancelled = false;
    fetch(endpoint, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as ResponseBody;
        if (!response.ok) throw new Error(body.error || 'Unable to load pricing models.');
        if (!cancelled) setModels(body.models ?? []);
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load pricing models.'); });
    return () => { cancelled = true; };
  }, [endpoint]);

  const hasDistanceLine = models?.some((model) => selectedCodes.includes(model.code) && model.unit === 'PER_KM') ?? false;

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setPreview(null); setDisclaimer(''); setLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelCodes: selectedCodes,
          ...(hasDistanceLine ? { distanceMetres: Number(distanceMetres) } : {}),
        }),
      });
      const body = await response.json() as ResponseBody;
      if (!response.ok) throw new Error(body.error || 'Unable to calculate preview.');
      setPreview(body.preview ?? null);
      setDisclaimer(body.disclaimer ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to calculate preview.');
    } finally { setLoading(false); }
  }

  async function loadWorksheetHistory() {
    setError(''); setLoading(true);
    try {
      const response = await fetch(endpoint.replace('/pricing-preview', '/pricing-worksheets'), { cache: 'no-store' });
      const body = await response.json() as ResponseBody;
      if (!response.ok) throw new Error(body.error || 'Unable to load worksheet history.');
      setWorksheetHistory(body.worksheets ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load worksheet history.');
    } finally { setLoading(false); }
  }

  async function saveWorksheet() {
    if (reason.trim().length < 8 || reason.trim().length > 500) {
      setError('Enter a reason of 8–500 characters to save a worksheet.');
      return;
    }
    setError(''); setSavedWorksheet(null); setLoading(true);
    try {
      const response = await fetch(`${endpoint.replace('/pricing-preview', '/pricing-worksheets')}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelCodes: selectedCodes, ...(hasDistanceLine ? { distanceMetres: Number(distanceMetres) } : {}), reason }),
      });
      const body = await response.json() as ResponseBody;
      if (!response.ok) throw new Error(body.error || 'Unable to save pricing worksheet.');
      setSavedWorksheet(body.worksheet ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save pricing worksheet.');
    } finally { setLoading(false); }
  }

  return <section className="vehicle-editor quotation-readiness" aria-labelledby="pricing-preview-title">
    <div className="vehicle-editor-heading"><div><p className="eyebrow">Internal only · RNT-04</p><h2 id="pricing-preview-title">Pre-tax pricing preview</h2></div></div>
    <p className="muted">This temporary calculation is visible only to rental managers while the request is Under Review. It is not saved or sent and is not a quotation. Tax, discounts, deposits, validity and approval are excluded.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!models ? <p role="status">Loading configured pricing models…</p> : models.length === 0
      ? <p className="form-help">No rental pricing models are configured. An authorized administrator must enter approved rates first.</p>
      : <form onSubmit={(event) => void calculate(event)}>
        <fieldset className="resource-buffer-form"><legend>Select configured pricing lines</legend>
          {models.map((model) => <label key={model.code}>
            <input type="checkbox" checked={selectedCodes.includes(model.code)} onChange={(event) => {
              setPreview(null); setSavedWorksheet(null); setSelectedCodes((current) => event.target.checked ? [...current, model.code] : current.filter((code) => code !== model.code));
            }} />
            {model.label} — {formatMoney(model.ratePesewas)} {unitLabels[model.unit]}
          </label>)}
        </fieldset>
        {hasDistanceLine && <label htmlFor="pricing-preview-distance">Operator-entered distance (whole metres)<input id="pricing-preview-distance" type="number" min="1" step="1" required value={distanceMetres} onChange={(event) => { setDistanceMetres(event.target.value); setPreview(null); setSavedWorksheet(null); }} /></label>}
        <p className="form-help">Time-priced lines use the saved requested duration or explicit scheduled interval. Conflicting or ambiguous time values block calculation. Kilometres require a distance entered for this preview; it is not stored.</p>
        <button className="button-primary" type="submit" disabled={loading || selectedCodes.length === 0 || (hasDistanceLine && !distanceMetres)}>{loading ? 'Calculating…' : 'Calculate pre-tax preview'}</button>
      </form>}
    {preview && <div className="settings-status-panel" aria-label="Pre-tax preview result">
      <h3>Pre-tax amounts only</h3>
      <ul>{preview.lines.map((line) => <li key={line.lineId}>{line.label}: {formatMoney(line.amountPesewas)}</li>)}</ul>
      <p><strong>Pre-tax subtotal: {formatMoney(preview.subtotalPesewas)}</strong></p>
      {disclaimer && <p className="form-help" role="status">{disclaimer}</p>}
      <label htmlFor="pricing-worksheet-reason">Reason for saving an immutable internal worksheet<textarea id="pricing-worksheet-reason" minLength={8} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button className="button-secondary" type="button" disabled={loading || reason.trim().length < 8} onClick={() => void saveWorksheet()}>{loading ? 'Saving…' : 'Save internal worksheet version'}</button>
      {savedWorksheet && <p className="form-success" role="status">Internal worksheet version {savedWorksheet.version} saved. It is not a quotation. Pre-tax amount: {formatMoney(savedWorksheet.preTaxSubtotalPesewas)}.</p>}
      <button className="button-secondary" type="button" disabled={loading} onClick={() => void loadWorksheetHistory()}>{loading ? 'Loading…' : 'Load saved worksheet history'}</button>
      {worksheetHistory && (worksheetHistory.length === 0 ? <p>No saved worksheet versions for this request.</p> : <ol aria-label="Saved internal worksheet versions">{worksheetHistory.map((item) => <li key={item.id}><details><summary>Version {item.version} · {formatMoney(item.preTaxSubtotalPesewas)} pre-tax · {new Date(item.createdAt).toLocaleString()}</summary><p>Reason: {item.reason}</p><ul>{item.lines.map((line) => <li key={line.lineId}>{line.label} ({line.modelCode}) — rate {formatMoney(line.ratePesewas)} ({line.unit.toLowerCase().replaceAll('_', ' ')}); {line.quantity.distanceMetres !== undefined ? `${line.quantity.distanceMetres} metres` : line.quantity.durationMinutes !== undefined ? `${line.quantity.durationMinutes} minutes` : 'one unit'}; line total {formatMoney(line.amountPesewas)}</li>)}</ul></details></li>)}</ol>)}
    </div>}
  </section>;
}
