'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DriverRecord } from '@/modules/fleet/drivers';

type DriverFormValues = Omit<DriverRecord, 'id' | 'createdAt' | 'updatedAt'>;
const emptyDriver: DriverFormValues = {
  fullName: '', licenceClass: null, licenceExpiresAt: null,
  qualifications: null, availability: null, status: null,
};

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

export function DriverManager({ companyId, driver }: { companyId: string; driver?: DriverRecord }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const values: DriverFormValues = driver ? {
    fullName: driver.fullName,
    licenceClass: driver.licenceClass,
    licenceExpiresAt: driver.licenceExpiresAt,
    qualifications: driver.qualifications,
    availability: driver.availability,
    status: driver.status,
  } : emptyDriver;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    setPending(true);
    setError('');
    setNotice('');
    const payload = {
      fullName: value(form, 'fullName'),
      licenceClass: value(form, 'licenceClass') || null,
      licenceExpiresAt: value(form, 'licenceExpiresAt') || null,
      qualifications: value(form, 'qualifications') || null,
      availability: value(form, 'availability') || null,
      status: value(form, 'status') || null,
      reason: value(form, 'reason'),
    };
    try {
      const response = await fetch(driver
        ? `/api/companies/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(driver.id)}`
        : `/api/companies/${encodeURIComponent(companyId)}/drivers`, {
        method: driver ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save this driver record.');
      setNotice('Driver record saved.');
      router.refresh();
      if (!driver) targetForm.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this driver record.');
    } finally {
      setPending(false);
    }
  }

  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!driver) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/drivers/${encodeURIComponent(driver.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to archive this driver record.');
      router.push('/fleet/drivers');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to archive this driver record.');
    } finally {
      setPending(false);
    }
  }

  return <section className="vehicle-editor" aria-labelledby="driver-editor-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Driver records</p><h2 id="driver-editor-title">{driver ? `Edit ${driver.fullName}` : 'Add a driver'}</h2></div>
      {driver && <a className="button-link" href="/fleet/drivers">Cancel editing</a>}
    </div>
    <p className="muted">Enter verified, work-relevant details only. Status and availability terms are free text until management defines a shared vocabulary.</p>
    <form className="vehicle-form" onSubmit={save}>
      <div className="vehicle-form-grid">
        <label>Full name<input name="fullName" required maxLength={160} autoComplete="name" defaultValue={values.fullName} /></label>
        <label>Licence class<input name="licenceClass" maxLength={80} defaultValue={values.licenceClass ?? ''} /></label>
        <label>Licence expiry<input name="licenceExpiresAt" type="date" defaultValue={values.licenceExpiresAt ?? ''} /></label>
        <label>Availability<input name="availability" maxLength={120} defaultValue={values.availability ?? ''} aria-describedby="driver-terms-help" /></label>
        <label>Status<input name="status" maxLength={80} defaultValue={values.status ?? ''} aria-describedby="driver-terms-help" /></label>
      </div>
      <label>Qualifications<textarea name="qualifications" rows={3} maxLength={1000} defaultValue={values.qualifications ?? ''} /></label>
      <label>Reason for {driver ? 'change' : 'creation'}<input name="reason" required minLength={8} maxLength={500} /></label>
      <p id="driver-terms-help" className="form-help">No status or availability values are preloaded. Use only your company’s confirmed wording.</p>
      <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : driver ? 'Save changes' : 'Add driver'}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </form>
    {driver && <details className="vehicle-archive">
      <summary>Archive this driver</summary>
      <p className="form-help">Archiving hides the record from the active driver register without deleting its history.</p>
      <form onSubmit={archive}>
        <label>Reason for archiving<input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} required minLength={8} maxLength={500} /></label>
        <button type="submit" className="button-danger" disabled={pending}>{pending ? 'Working…' : 'Archive driver'}</button>
      </form>
    </details>}
  </section>;
}
