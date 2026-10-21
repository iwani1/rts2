'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { BookingCreationCutoff } from '@/modules/settings/registry';

type Mode = 'NONE' | 'HOURS_BEFORE_JOURNEY';

/**
 * BKG-05 (D-090/5C): booking creation is rejected when "now" is past the
 * journey date minus the configured number of hours (BKG-05a / D-056).
 * The operator picks the mode explicitly: an explicit NONE record or a
 * whole-hours cutoff (0–720). Nothing is prefilled; when no record exists
 * at all, booking creation applies no cutoff.
 */
export function BookingCutoffEditor({ companyId }: { companyId: string }) {
  const [cutoff, setCutoff] = useState<BookingCreationCutoff | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/booking-cutoff`, { cache: 'no-store' });
    const body = await response.json() as { cutoff: BookingCreationCutoff | null; error?: string };
    if (!response.ok) throw new Error(body.error || 'Unable to load booking cutoff.');
    setCutoff(body.cutoff);
    setLoaded(true);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/booking-cutoff`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { cutoff: BookingCreationCutoff | null; error?: string };
        if (!response.ok) throw new Error(body.error || 'Unable to load booking cutoff.');
        if (!cancelled) { setCutoff(body.cutoff); setLoaded(true); }
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load booking cutoff.'); });
    return () => { cancelled = true; };
  }, [companyId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const mode = String(form.get('mode') || '') as Mode;
    let value: BookingCreationCutoff;
    if (mode === 'NONE') {
      value = { mode: 'NONE' };
    } else if (mode === 'HOURS_BEFORE_JOURNEY') {
      const hours = Number(form.get('hours'));
      value = { mode: 'HOURS_BEFORE_JOURNEY', hours };
    } else {
      setError('Choose whether a cutoff applies.');
      return;
    }
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'bookings.creation_cutoff', value, reason: String(form.get('reason') || '') }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to save booking cutoff.');
      await load();
      setNotice('Booking creation cutoff saved.');
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save booking cutoff.');
    } finally { setSaving(false); }
  }

  const describeCutoff = (value: BookingCreationCutoff | null): string => {
    if (!value) return 'Not configured (no cutoff applies)';
    if (value.mode === 'NONE') return 'Explicitly no cutoff';
    return `Creation closes ${value.hours} hour(s) before the journey date`;
  };

  return <section className="settings-status-panel" aria-labelledby="booking-cutoff-title">
    <div className="fleet-list-heading"><div>
      <p className="eyebrow">BKG-05</p><h2 id="booking-cutoff-title">Booking creation cutoff</h2>
      <p className="muted">Control how close to the journey date a booking may still be created (BKG-05a). Values are entered explicitly with an audit reason; nothing is prefilled.</p>
    </div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
    <p className="setting-status">Current value: {!loaded ? 'Loading…' : describeCutoff(cutoff)}</p>
    <form onSubmit={(event) => void save(event)}>
      <fieldset className="resource-buffer-form">
        <legend>Cutoff mode</legend>
        <label htmlFor="booking-cutoff-mode-none">
          <input id="booking-cutoff-mode-none" type="radio" name="mode" value="NONE" /> No cutoff — bookings may be created up to the journey date
        </label>
        <label htmlFor="booking-cutoff-mode-hours">
          <input id="booking-cutoff-mode-hours" type="radio" name="mode" value="HOURS_BEFORE_JOURNEY" /> Close creation a set number of hours before the journey date
        </label>
        <label htmlFor="booking-cutoff-hours">Hours before the journey date (0–720)
          <input id="booking-cutoff-hours" name="hours" type="number" min="0" max="720" step="1" />
        </label>
      </fieldset>
      <label htmlFor="booking-cutoff-reason">Reason for change
        <textarea id="booking-cutoff-reason" name="reason" minLength={8} maxLength={500} required />
      </label>
      <button className="button-primary" type="submit" disabled={saving || !loaded}>{saving ? 'Saving…' : 'Save booking cutoff'}</button>
    </form>
  </section>;
}
