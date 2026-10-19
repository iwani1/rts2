'use client';

import { FormEvent, useEffect, useState } from 'react';

type Buffers = { vehicleBufferMinutes: number | null; driverBufferMinutes: number | null };
type BufferField = {
  key: 'fleet.vehicle_between_job_buffer_minutes' | 'fleet.driver_between_job_buffer_minutes';
  label: string;
  name: keyof Buffers;
  description: string;
};
const fields: BufferField[] = [
  { key: 'fleet.vehicle_between_job_buffer_minutes', label: 'Vehicle buffer', name: 'vehicleBufferMinutes', description: 'Minimum time after one booking before the vehicle may be committed to another.' },
  { key: 'fleet.driver_between_job_buffer_minutes', label: 'Driver buffer', name: 'driverBufferMinutes', description: 'Minimum time after one booking before the driver may be committed to another.' },
];

export function ResourceBuffersEditor({ companyId }: { companyId: string }) {
  const [buffers, setBuffers] = useState<Buffers | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/resource-buffers`, { cache: 'no-store' });
    const body = await response.json() as Buffers & { error?: string };
    if (!response.ok) throw new Error(body.error || 'Unable to load resource buffers.');
    setBuffers(body);
  }
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/resource-buffers`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as Buffers & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to load resource buffers.');
        if (!cancelled) setBuffers(body);
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load resource buffers.'); });
    return () => { cancelled = true; };
  }, [companyId]);

  async function save(event: FormEvent<HTMLFormElement>, field: BufferField) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(''); setNotice(''); setSaving(field.name);
    const form = new FormData(formElement);
    const value = Number(form.get('minutes'));
    const reason = String(form.get('reason') || '');
    try {
      const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/settings`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: field.key, value, reason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save resource buffer.');
      await load();
      setNotice(`${field.label} saved.`);
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save resource buffer.');
    } finally { setSaving(null); }
  }

  return <section className="settings-status-panel" aria-labelledby="resource-buffer-title">
    <div className="fleet-list-heading"><div><p className="eyebrow">RNT-03</p><h2 id="resource-buffer-title">Resource turnaround buffers</h2>
      <p className="muted">No default is assumed. Configure each buffer only after operational review. An unset buffer blocks reservation commitments for that resource type.</p>
    </div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {!buffers ? <p role="status">Loading resource buffers…</p> : <div className="resource-buffer-grid">{fields.map((field) => <form key={field.key} className="resource-buffer-form" onSubmit={(event) => void save(event, field)}>
      <h3>{field.label}</h3><p className="muted">{field.description}</p>
      <p className="setting-status">Current value: {buffers[field.name] === null ? 'Not configured' : `${buffers[field.name]} minutes`}</p>
      <label htmlFor={`${field.name}-minutes`}>Buffer minutes</label>
      <input id={`${field.name}-minutes`} name="minutes" type="number" min="0" step="1" required />
      <label htmlFor={`${field.name}-reason`}>Reason for change</label>
      <textarea id={`${field.name}-reason`} name="reason" minLength={8} maxLength={500} required />
      <button className="button-primary" type="submit" disabled={saving !== null}>{saving === field.name ? 'Saving…' : `Save ${field.label.toLowerCase()}`}</button>
    </form>)}</div>}
  </section>;
}
