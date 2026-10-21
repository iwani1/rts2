'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EmployeeRecord } from '@/modules/employees/employees';
import type { EmployeeImportPreview } from '@/modules/employees/employees';
import { employeeImportHeaders } from '@/modules/employees/employee-import-constants';

type ClientOption = { id: string; name: string };

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

export function EmployeeManager({ companyId, clients, employee }: {
  companyId: string; clients: ClientOption[]; employee?: EmployeeRecord;
}) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [importClientId, setImportClientId] = useState('');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<EmployeeImportPreview | null>(null);
  const [importReason, setImportReason] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    setPending(true);
    setError('');
    setNotice('');
    const eligibility = value(form, 'transportEligible');
    const payload = {
      clientId: value(form, 'clientId'),
      reference: value(form, 'reference') || null,
      fullName: value(form, 'fullName'),
      telephone: value(form, 'telephone') || null,
      email: value(form, 'email') || null,
      homeAddress: value(form, 'homeAddress') || null,
      department: value(form, 'department') || null,
      workLocation: value(form, 'workLocation') || null,
      shift: value(form, 'shift') || null,
      approvedPickupLocation: value(form, 'approvedPickupLocation') || null,
      approvedDropoffLocation: value(form, 'approvedDropoffLocation') || null,
      accountStatus: value(form, 'accountStatus') || null,
      transportEligible: eligibility === '' ? null : eligibility === 'true',
      accessibilityNeeds: value(form, 'accessibilityNeeds') || null,
      notes: value(form, 'notes') || null,
      reason: value(form, 'reason'),
    };
    try {
      const response = await fetch(employee
        ? `/api/companies/${encodeURIComponent(companyId)}/employees/${encodeURIComponent(employee.id)}`
        : `/api/companies/${encodeURIComponent(companyId)}/employees`, {
        method: employee ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save this employee record.');
      setNotice('Employee record saved.');
      router.refresh();
      if (!employee) targetForm.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this employee record.');
    } finally {
      setPending(false);
    }
  }

  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/employees/${encodeURIComponent(employee.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to archive this employee record.');
      router.push('/employees');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to archive this employee record.');
    } finally {
      setPending(false);
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setCsv(file ? await file.text() : '');
  }

  async function previewImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/employees/import/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: importClientId, csv }),
      });
      const body = await response.json() as { error?: string; preview?: EmployeeImportPreview };
      if (!response.ok || !body.preview) throw new Error(body.error || 'Unable to preview this CSV.');
      setPreview(body.preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to preview this CSV.');
    } finally {
      setPending(false);
    }
  }

  async function confirmImport() {
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/employees/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: importClientId, csv, reason: importReason }),
      });
      const body = await response.json() as { error?: string; result?: { importedCount: number }; preview?: EmployeeImportPreview };
      if (!response.ok) {
        if (body.preview) setPreview(body.preview);
        throw new Error(body.error || 'Unable to import this CSV.');
      }
      setNotice(`Imported ${body.result?.importedCount ?? 0} employee record(s).`);
      setPreview(null);
      setCsv('');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to import this CSV.');
    } finally {
      setPending(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([`${employeeImportHeaders.join(',')}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employee-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return <section className="vehicle-editor" aria-labelledby="employee-editor-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Employee records</p><h2 id="employee-editor-title">{employee ? `Edit ${employee.fullName}` : 'Add an employee'}</h2></div>
      {employee && <a className="button-link" href="/employees">Cancel editing</a>}
    </div>
    <p className="muted">Record only details the client has supplied for staff transport. Home address, contact details and accessibility needs are restricted: they are visible only to authorised managers and are excluded from rosters and exports.</p>
    <form className="vehicle-form" onSubmit={save}>
      <div className="vehicle-form-grid">
        <label>Client
          <select name="clientId" required defaultValue={employee?.clientId ?? ''}>
            <option value="" disabled>Select a client</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label>Full name<input name="fullName" required maxLength={160} autoComplete="name" defaultValue={employee?.fullName ?? ''} /></label>
        <label>Reference (optional, unique per company)<input name="reference" maxLength={64} defaultValue={employee?.reference ?? ''} /></label>
        <label>Department (optional)<input name="department" maxLength={120} defaultValue={employee?.department ?? ''} /></label>
        <label>Telephone (restricted)<input name="telephone" type="tel" maxLength={80} autoComplete="tel" defaultValue={employee?.telephone ?? ''} /></label>
        <label>Email (restricted)<input name="email" type="email" maxLength={254} autoComplete="email" defaultValue={employee?.email ?? ''} /></label>
      </div>
      <label>Home address (restricted)<textarea name="homeAddress" rows={2} maxLength={500} defaultValue={employee?.homeAddress ?? ''} /></label>
      <div className="vehicle-form-grid">
        <label>Work location (optional)<input name="workLocation" maxLength={300} defaultValue={employee?.workLocation ?? ''} /></label>
        <label>Shift as supplied (optional)<input name="shift" maxLength={120} defaultValue={employee?.shift ?? ''} /></label>
        <label>Account status as supplied (optional)<input name="accountStatus" maxLength={80} defaultValue={employee?.accountStatus ?? ''} /></label>
        <label>Transport eligibility
          <select name="transportEligible" defaultValue={employee?.transportEligible === null || employee?.transportEligible === undefined ? '' : String(employee.transportEligible)}>
            <option value="">Not recorded</option>
            <option value="true">Eligible</option>
            <option value="false">Not eligible</option>
          </select>
        </label>
      </div>
      <label>Approved pickup location (landmark description)<textarea name="approvedPickupLocation" rows={2} maxLength={500} defaultValue={employee?.approvedPickupLocation ?? ''} /></label>
      <label>Approved drop-off location (landmark description)<textarea name="approvedDropoffLocation" rows={2} maxLength={500} defaultValue={employee?.approvedDropoffLocation ?? ''} /></label>
      <label>Accessibility needs, voluntarily supplied (restricted)<textarea name="accessibilityNeeds" rows={2} maxLength={1000} defaultValue={employee?.accessibilityNeeds ?? ''} /></label>
      <label>Notes<textarea name="notes" rows={3} maxLength={2000} defaultValue={employee?.notes ?? ''} /></label>
      <label>Reason for {employee ? 'change' : 'creation'}<input name="reason" required minLength={8} maxLength={500} /></label>
      <p className="form-help">The reason is recorded in audit history; do not include employee personal details in it.</p>
      <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Saving…' : employee ? 'Save changes' : 'Add employee'}</button></div>
    </form>
    {employee && <details className="vehicle-archive">
      <summary>Archive this employee</summary>
      <p className="form-help">Archiving hides the record from the active register without deleting its retained history.</p>
      <form onSubmit={archive}>
        <label>Reason for archiving<input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} required minLength={8} maxLength={500} /></label>
        <button type="submit" className="button-danger" disabled={!interactive || pending}>{pending ? 'Working…' : 'Archive employee'}</button>
      </form>
    </details>}
    <details className="vehicle-archive">
      <summary>Import employees from CSV</summary>
      <p className="form-help">Imports are all-or-nothing: preview every row first; nothing is saved while any row has an error. Possible duplicates are warnings only — rows are never merged or skipped automatically. A reference is unique per company when supplied. Eligibility cells accept TRUE, FALSE, or blank (not recorded).</p>
      <button type="button" className="button-link" onClick={downloadTemplate}>Download CSV template</button>
      <form className="vehicle-form" onSubmit={previewImport}>
        <label>Client for every row in this file
          <select required value={importClientId} onChange={(event) => { setImportClientId(event.target.value); setPreview(null); }}>
            <option value="" disabled>Select a client</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label>CSV file<input type="file" accept=".csv,text/csv" required onChange={onFile} /></label>
        <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending || !csv || !importClientId}>{pending ? 'Working…' : 'Preview import'}</button></div>
      </form>
      {preview && <div>
        <p role="status">{preview.totalRows} row(s): {preview.validRows} valid, {preview.invalidRows} with errors, {preview.warningRows} with possible-duplicate warnings.</p>
        {preview.fileErrors.length > 0 && <ul>{preview.fileErrors.map((fileError) => <li key={fileError} className="form-error">{fileError}</li>)}</ul>}
        {preview.rows.length > 0 && <div className="vehicle-table-wrap" role="region" aria-label="Import preview rows" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Import preview</caption><thead><tr><th scope="col">Row</th><th scope="col">Employee</th><th scope="col">Reference</th><th scope="col">Errors</th><th scope="col">Warnings</th></tr></thead>
            <tbody>{preview.rows.map((row) => <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td>
              <td>{row.fullName}</td>
              <td>{row.reference ?? ''}</td>
              <td>{row.errors.length > 0 ? <ul>{row.errors.map((rowError) => <li key={rowError}>{rowError}</li>)}</ul> : '—'}</td>
              <td>{row.warnings.length > 0 ? <ul>{row.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <label>Reason for import<input value={importReason} onChange={(event) => setImportReason(event.target.value)} minLength={8} maxLength={500} /></label>
        <div className="vehicle-form-actions"><button type="button" className="button-primary" onClick={confirmImport} disabled={!interactive || pending || !preview.canImport || importReason.trim().length < 8}>{pending ? 'Importing…' : `Import ${preview.validRows} employee(s)`}</button></div>
        {!preview.canImport && preview.fileErrors.length === 0 && <p className="form-help">Fix every row error above, then preview again. No rows have been saved.</p>}
      </div>}
    </details>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </section>;
}
