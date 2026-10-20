'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DriverImportPreview } from '@/modules/fleet/drivers';
import { MAX_IMPORT_CSV_BYTES } from '@/modules/imports/csv-constants';
import { driverImportHeaders } from '@/modules/fleet/driver-import-constants';

export function DriverImportManager({ companyId }: { companyId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<DriverImportPreview | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importedDrivers, setImportedDrivers] = useState<Array<{ fullName: string }>>([]);
  const templateUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(`${driverImportHeaders.join(',')}\r\n`)}`;

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
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/drivers/import/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }),
      });
      const body = await response.json() as { preview?: DriverImportPreview; error?: string };
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
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/drivers/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, reason }),
      });
      const body = await response.json() as { result?: { importedCount: number; drivers?: Array<{ id: string; fullName: string }> }; preview?: DriverImportPreview; error?: string };
      if (!response.ok) {
        if (body.preview) setPreview(body.preview);
        throw new Error(body.error || 'Unable to import this CSV file.');
      }
      const count = body.result?.importedCount ?? 0;
      setImportedDrivers((body.result?.drivers ?? []).map(({ fullName }) => ({ fullName })));
      setNotice(`${count === 1 ? '1 driver record' : `${count} driver records`} imported.`);
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

  return <section className="vehicle-editor csv-import-manager" aria-labelledby="driver-import-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Driver register</p><h2 id="driver-import-title">Import drivers from CSV</h2></div>
      <a className="button-link" href="/fleet/drivers">Back to driver register</a>
    </div>
    <p className="muted">Create new driver records using only approved register fields. Status and availability are optional free text; no defaults or preset values are added.</p>
    <p><a className="button-link" href={templateUrl} download="richie-driver-import-template.csv">Download CSV template</a></p>
    <label>Driver CSV file<input
      ref={fileInputRef}
      type="file" accept=".csv,text/csv" disabled={pending}
      onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setError(''); setNotice(''); setImportedDrivers([]); }}
    /></label>
    {file && <p className="form-help">Selected: {file.name} ({file.size.toLocaleString()} bytes)</p>}
    <div className="vehicle-form-actions"><button className="button-primary" type="button" disabled={pending || !file} onClick={previewFile}>{pending ? 'Working…' : 'Preview CSV'}</button></div>

    {preview && <section className="import-preview driver-import-preview" aria-labelledby="driver-import-preview-title">
      <h3 id="driver-import-preview-title">Preview and validation</h3>
      {preview.fileErrors.length > 0 ? <ul className="form-error-list" role="alert">{preview.fileErrors.map((message) => <li key={message}>{message}</li>)}</ul> : <>
        <p role="status">{preview.totalRows} rows found: {preview.validRows} valid, {preview.invalidRows} with errors.</p>
        <p className="form-help">Possible same-name matches are warnings only. A name is not proof of identity; every valid row will be created separately, with no automatic skip, merge, or update.</p>
        <div className="vehicle-table-wrap" role="region" aria-label="Driver import row validation" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Driver CSV rows and validation results</caption>
            <thead><tr><th scope="col">CSV row</th><th scope="col">Driver name</th><th scope="col">Licence class</th><th scope="col">Licence expiry</th><th scope="col">Qualifications</th><th scope="col">Availability</th><th scope="col">Status</th><th scope="col">Validation</th><th scope="col">Possible duplicate warning</th></tr></thead>
            <tbody>{preview.rows.map((row) => <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td><td>{row.fullName || 'Name missing'}</td><td>{row.licenceClass || '—'}</td><td>{row.licenceExpiresAt || '—'}</td><td>{row.qualifications || '—'}</td><td>{row.availability || '—'}</td><td>{row.status || '—'}</td>
              <td>{row.errors.length === 0 ? 'Valid' : <ul className="form-error-list">{row.errors.map((message) => <li key={message}>{message}</li>)}</ul>}</td>
              <td>{row.warnings.length === 0 ? '—' : <ul>{row.warnings.map((message) => <li key={message}>{message}</li>)}</ul>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {preview.canImport
          ? <p className="form-help">All rows are valid. The full batch will be created in one transaction; existing driver records will not be changed or merged.</p>
          : <p className="form-error" role="alert">All-or-nothing import: correct every file or row error and preview the corrected CSV again. No drivers have been imported.</p>}
      </>}
    </section>}

    {preview?.canImport && <>
      <label>Reason for this import<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500} required /></label>
      <p className="form-help">This reason is recorded in each imported driver’s audit history. Do not include personal details.</p>
      <div className="vehicle-form-actions"><button className="button-submit-request" type="button" disabled={pending || reason.trim().length < 8} onClick={importFile}>
        {pending ? 'Importing…' : preview.validRows === 1 ? 'Import 1 driver' : `Import all ${preview.validRows} drivers`}
      </button></div>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {importedDrivers.length > 0 && <section className="import-success-summary" aria-labelledby="driver-import-summary-title">
      <h3 id="driver-import-summary-title">Imported driver records</h3>
      <ul>{importedDrivers.map((driver, index) => <li key={`${driver.fullName}-${index}`}><strong>{driver.fullName}</strong></li>)}</ul>
    </section>}
  </section>;
}
