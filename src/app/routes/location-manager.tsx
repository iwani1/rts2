'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LocationRecord } from '@/modules/routes/locations';

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

export function LocationManager({ companyId, location }: { companyId: string; location?: LocationRecord }) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [archiveReason, setArchiveReason] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    setPending(true);
    setError('');
    setNotice('');
    const latitude = value(form, 'latitude');
    const longitude = value(form, 'longitude');
    const payload = {
      name: value(form, 'name'),
      latitude: latitude === '' ? null : Number(latitude),
      longitude: longitude === '' ? null : Number(longitude),
      landmarkDescription: value(form, 'landmarkDescription') || null,
      ghanaDigitalAddress: value(form, 'ghanaDigitalAddress') || null,
      notes: value(form, 'notes') || null,
      reason: value(form, 'reason'),
    };
    try {
      const response = await fetch(location
        ? `/api/companies/${encodeURIComponent(companyId)}/locations/${encodeURIComponent(location.id)}`
        : `/api/companies/${encodeURIComponent(companyId)}/locations`, {
        method: location ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save this location.');
      setNotice('Location saved.');
      router.refresh();
      if (!location) targetForm.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this location.');
    } finally {
      setPending(false);
    }
  }

  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/locations/${encodeURIComponent(location.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to archive this location.');
      router.push('/routes');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to archive this location.');
    } finally {
      setPending(false);
    }
  }

  return <section className="vehicle-editor" aria-labelledby="location-editor-title">
    <div className="vehicle-editor-heading">
      <div><p className="eyebrow">Locations</p><h2 id="location-editor-title">{location ? `Edit ${location.name}` : 'Add a location'}</h2></div>
      {location && <a className="button-link" href="/routes">Cancel editing</a>}
    </div>
    <p className="muted">Coordinates are optional. Where an address is unreliable, record a landmark description and, when known, the Ghana digital address.</p>
    <form className="vehicle-form" onSubmit={save}>
      <div className="vehicle-form-grid">
        <label>Location name<input name="name" required maxLength={160} defaultValue={location?.name ?? ''} /></label>
        <label>Latitude (optional)<input name="latitude" type="number" step="0.000001" min={-90} max={90} defaultValue={location?.latitude ?? ''} /></label>
        <label>Longitude (optional)<input name="longitude" type="number" step="0.000001" min={-180} max={180} defaultValue={location?.longitude ?? ''} /></label>
        <label>Ghana digital address (optional)<input name="ghanaDigitalAddress" maxLength={120} defaultValue={location?.ghanaDigitalAddress ?? ''} /></label>
      </div>
      <label>Landmark description<textarea name="landmarkDescription" rows={2} maxLength={500} defaultValue={location?.landmarkDescription ?? ''} /></label>
      <label>Notes<textarea name="notes" rows={2} maxLength={2000} defaultValue={location?.notes ?? ''} /></label>
      <label>Reason for {location ? 'change' : 'creation'}<input name="reason" required minLength={8} maxLength={500} /></label>
      <p className="form-help">Latitude and longitude must be recorded together, or both left blank.</p>
      <div className="vehicle-form-actions"><button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Saving…' : location ? 'Save changes' : 'Add location'}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </form>
    {location && <details className="vehicle-archive">
      <summary>Archive this location</summary>
      <p className="form-help">Archiving hides the location from new routes and stops. Existing routes keep their recorded references.</p>
      <form onSubmit={archive}>
        <label>Reason for archiving<input value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} required minLength={8} maxLength={500} /></label>
        <button type="submit" className="button-danger" disabled={!interactive || pending}>{pending ? 'Working…' : 'Archive location'}</button>
      </form>
    </details>}
  </section>;
}
