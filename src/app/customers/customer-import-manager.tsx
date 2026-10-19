'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CustomerImportPreview } from '@/modules/customers/customers';
import { MAX_CUSTOMER_IMPORT_BYTES, customerImportHeaders } from '@/modules/customers/customer-import-constants';

export function CustomerImportManager({ companyId }: { companyId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CustomerImportPreview | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importedRecords, setImportedRecords] = useState<Array<{ displayName: string; reference: string | null }>>([]);
  const template = `${customerImportHeaders.join(',')}\r\n`;
  const templateUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(template)}`;

  async function readCsv() {
    if (!file) throw new Error('Choose a CSV file first.');
    if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a file with a .csv extension.');
    if (file.size > MAX_CUSTOMER_IMPORT_BYTES) throw new Error(`The file exceeds the ${Math.round(MAX_CUSTOMER_IMPORT_BYTES / 1_000_000)} MB technical limit.`);
    return file.text();
  }

  async function previewFile() {
    setPending(true);
    setError('');
    setNotice('');
    setPreview(null);
    try {
      const csv = await readCsv();
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/customers/import/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const body = await response.json() as { preview?: CustomerImportPreview; error?: string };
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
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/customers/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, reason }),
      });
      const body = await response.json() as {
        result?: { importedCount: number; customers?: Array<{ id: string; displayName: string; reference: string | null }> };
        preview?: CustomerImportPreview;
        error?: string;
      };
      if (!response.ok) {
        if (body.preview) setPreview(body.preview);
        throw new Error(body.error || 'Unable to import this CSV file.');
      }
      const count = body.result?.importedCount ?? 0;
      setImportedRecords((body.result?.customers ?? []).map(({ displayName, reference }) => ({ displayName, reference })));
      setNotice(`${count === 1 ? '1 customer record' : `${count} customer records`} imported.`);
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

  return <section className="vehicle-editor csv-import-manager" aria-labelledby="customer-import-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Customer register</p><h2 id="customer-import-title">Import customers from CSV</h2></div>
      <a className="button-link" href="/customers">Back to customer register</a>
    </div>
    <p className="muted">Upload new customer records only. The file must use the supplied field names. This importer does not update, merge or archive existing records.</p>
    <p><a className="button-link" href={templateUrl} download="richie-customer-import-template.csv">Download CSV template</a></p>
    <label>Customer CSV file<input
      ref={fileInputRef}
      type="file"
      accept=".csv,text/csv"
      onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setError(''); setNotice(''); setImportedRecords([]); }}
      disabled={pending}
    /></label>
    {file && <p className="form-help">Selected: {file.name} ({file.size.toLocaleString()} bytes)</p>}
    <div className="vehicle-form-actions">
      <button className="button-primary" type="button" disabled={pending || !file} onClick={previewFile}>{pending ? 'Working…' : 'Preview CSV'}</button>
    </div>

    {preview && <section className="import-preview customer-import-preview" aria-labelledby="customer-import-preview-title">
      <h3 id="customer-import-preview-title">Preview and validation</h3>
      {preview.fileErrors.length > 0 ? <ul className="form-error-list" role="alert">{preview.fileErrors.map((message) => <li key={message}>{message}</li>)}</ul> : <>
        <p role="status">{preview.totalRows} rows found: {preview.validRows} valid, {preview.invalidRows} with errors.</p>
        <div className="vehicle-table-wrap" role="region" aria-label="Customer import row validation" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">CSV rows and validation results</caption>
            <thead><tr><th scope="col">CSV row</th><th scope="col">Customer name</th><th scope="col">Reference</th><th scope="col">Contact person</th><th scope="col">Telephone</th><th scope="col">Email</th><th scope="col">Billing details</th><th scope="col">Customer type</th><th scope="col">Status</th><th scope="col">Notes</th><th scope="col">Validation</th></tr></thead>
            <tbody>{preview.rows.map((row) => <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td><td>{row.displayName || 'Name missing'}</td><td>{row.reference ?? '—'}</td>
              <td>{row.contactPerson ?? '—'}</td><td>{row.telephone ?? '—'}</td><td>{row.email ?? '—'}</td><td>{row.billingDetails ?? '—'}</td>
              <td>{row.customerType ?? '—'}</td><td>{row.status ?? '—'}</td><td>{row.notes ?? '—'}</td>
              <td>{row.errors.length === 0 ? 'Valid' : <ul className="form-error-list">{row.errors.map((message) => <li key={message}>{message}</li>)}</ul>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {preview.canImport
          ? <p className="form-help">All rows are valid. The entire batch will be created in one transaction; no existing records will be changed.</p>
          : <p className="form-error" role="alert">All-or-nothing import: correct every file or row error and preview the corrected CSV again. No records have been imported.</p>}
      </>}
    </section>}

    {preview?.canImport && <>
      <label>Reason for this import<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} maxLength={500} required /></label>
      <p className="form-help">This reason is included in each imported customer’s audit history. Do not include sensitive personal or billing details.</p>
      <div className="vehicle-form-actions">
        <button className="button-submit-request" type="button" disabled={pending || reason.trim().length < 8} onClick={importFile}>
          {pending ? 'Importing…' : preview.validRows === 1 ? 'Import 1 customer' : `Import all ${preview.validRows} customers`}
        </button>
      </div>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {importedRecords.length > 0 && <section className="import-success-summary" aria-labelledby="customer-import-summary-title">
      <h3 id="customer-import-summary-title">Imported customer records</h3>
      <ul>{importedRecords.map((record, index) => <li key={`${record.reference ?? record.displayName}-${index}`}><strong>{record.displayName}</strong>{record.reference && <span>Reference: {record.reference}</span>}</li>)}</ul>
    </section>}
  </section>;
}
