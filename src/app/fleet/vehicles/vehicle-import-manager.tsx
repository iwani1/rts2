'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VehicleImportPreview } from '@/modules/fleet/vehicles';
import { MAX_IMPORT_CSV_BYTES } from '@/modules/imports/csv-constants';
import { vehicleImportHeaders } from '@/modules/fleet/vehicle-import-constants';

export function VehicleImportManager({ companyId }: { companyId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<VehicleImportPreview | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importedVehicles, setImportedVehicles] = useState<Array<{ registrationNumber: string; make: string; model: string }>>([]);
  const templateUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(`${vehicleImportHeaders.join(',')}\r\n`)}`;

  async function readCsv() {
    if (!file) throw new Error('Choose a CSV file first.');
    if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a file with a .csv extension.');
    if (file.size > MAX_IMPORT_CSV_BYTES) throw new Error('The file exceeds the 2 MB technical limit.');
    return file.text();
  }

  async function previewFile() {
    setPending(true);
    setError('');
    setNotice('');
    setPreview(null);
    try {
      const csv = await readCsv();
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/vehicles/import/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }),
      });
      const body = await response.json() as { preview?: VehicleImportPreview; error?: string };
      if (!response.ok || !body.preview) throw new Error(body.error || 'Unable to preview this CSV file.');
      setPreview(body.preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to preview this CSV file.');
    } finally {
      setPending(false);
    }
  }

  async function importFile() {
    if (!preview?.canImport) return;
    if (reason.trim().length < 8) {
      setError('Enter a reason of at least eight characters before importing.');
      return;
    }
    setPending(true);
    setError('');
    setNotice('');
    try {
      const csv = await readCsv();
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/vehicles/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, reason }),
      });
      const body = await response.json() as { result?: { importedCount: number; vehicles?: Array<{ id: string; registrationNumber: string; make: string; model: string }> }; preview?: VehicleImportPreview; error?: string };
      if (!response.ok) {
        if (body.preview) setPreview(body.preview);
        throw new Error(body.error || 'Unable to import this CSV file.');
      }
      const count = body.result?.importedCount ?? 0;
      setImportedVehicles((body.result?.vehicles ?? []).map(({ registrationNumber, make, model }) => ({ registrationNumber, make, model })));
      setNotice(`${count === 1 ? '1 vehicle record' : `${count} vehicle records`} imported.`);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setPreview(null);
      setReason('');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to import this CSV file.');
    } finally {
      setPending(false);
    }
  }

  return <section className="vehicle-editor csv-import-manager" aria-labelledby="vehicle-import-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Vehicle register</p><h2 id="vehicle-import-title">Import vehicles from CSV</h2></div>
      <a className="button-link" href="/fleet/vehicles">Back to vehicle register</a>
    </div>
    <p className="muted">Create new vehicle master records only. This import does not set status, assign a usual driver, or import photos or documents.</p>
    <p><a className="button-link" href={templateUrl} download="richie-vehicle-import-template.csv">Download CSV template</a></p>
    <label>Vehicle CSV file<input
      ref={fileInputRef}
      type="file" accept=".csv,text/csv" disabled={pending}
      onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setError(''); setNotice(''); setImportedVehicles([]); }}
    /></label>
    {file && <p className="form-help">Selected: {file.name} ({file.size.toLocaleString()} bytes)</p>}
    <div className="vehicle-form-actions"><button className="button-primary" type="button" disabled={pending || !file} onClick={previewFile}>{pending ? 'Working…' : 'Preview CSV'}</button></div>

    {preview && <section className="import-preview vehicle-import-preview" aria-labelledby="vehicle-import-preview-title">
      <h3 id="vehicle-import-preview-title">Preview and validation</h3>
      {preview.fileErrors.length > 0 ? <ul className="form-error-list" role="alert">{preview.fileErrors.map((message) => <li key={message}>{message}</li>)}</ul> : <>
        <p role="status">{preview.totalRows} rows found: {preview.validRows} valid, {preview.invalidRows} with errors.</p>
        <div className="vehicle-table-wrap" role="region" aria-label="Vehicle import row validation" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">CSV rows and validation results</caption>
            <thead><tr><th scope="col">CSV row</th><th scope="col">Registration</th><th scope="col">Make</th><th scope="col">Model</th><th scope="col">Category</th><th scope="col">Seats</th><th scope="col">Fuel type</th><th scope="col">Ownership</th><th scope="col">Odometer</th><th scope="col">Unit</th><th scope="col">Insurance expiry</th><th scope="col">Roadworthiness expiry</th><th scope="col">Registration expiry</th><th scope="col">Next service</th><th scope="col">Notes</th><th scope="col">Validation</th></tr></thead>
            <tbody>{preview.rows.map((row) => <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td><td>{row.registrationNumber || 'Registration missing'}</td><td>{row.make || '—'}</td><td>{row.model || '—'}</td><td>{row.category || '—'}</td>
              <td>{row.values.seatCount || '—'}</td><td>{row.values.fuelType || '—'}</td><td>{row.values.ownershipType || '—'}</td><td>{row.values.odometerValue || '—'}</td><td>{row.values.odometerUnit || '—'}</td>
              <td>{row.values.insuranceExpiresAt || '—'}</td><td>{row.values.roadworthinessExpiresAt || '—'}</td><td>{row.values.registrationExpiresAt || '—'}</td><td>{row.values.nextServiceAt || '—'}</td><td>{row.values.notes || '—'}</td>
              <td>{row.errors.length === 0 ? 'Valid' : <ul className="form-error-list">{row.errors.map((message) => <li key={message}>{message}</li>)}</ul>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {preview.canImport
          ? <p className="form-help">All rows are valid. The full batch will be created in one transaction; existing vehicles will not be changed.</p>
          : <p className="form-error" role="alert">All-or-nothing import: correct every file or row error and preview the corrected CSV again. No vehicles have been imported.</p>}
      </>}
    </section>}

    {preview?.canImport && <>
      <label>Reason for this import<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500} required /></label>
      <p className="form-help">This reason is recorded in each imported vehicle’s audit history. Do not include personal details.</p>
      <div className="vehicle-form-actions"><button className="button-submit-request" type="button" disabled={pending || reason.trim().length < 8} onClick={importFile}>
        {pending ? 'Importing…' : preview.validRows === 1 ? 'Import 1 vehicle' : `Import all ${preview.validRows} vehicles`}
      </button></div>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {importedVehicles.length > 0 && <section className="import-success-summary" aria-labelledby="vehicle-import-summary-title">
      <h3 id="vehicle-import-summary-title">Imported vehicle records</h3>
      <ul>{importedVehicles.map((vehicle) => <li key={vehicle.registrationNumber}><strong>{vehicle.registrationNumber}</strong><span>{vehicle.make} {vehicle.model}</span></li>)}</ul>
    </section>}
  </section>;
}
