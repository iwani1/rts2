'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NotificationPreferences } from '@/modules/notifications/notifications';

async function post(url: string) {
  const response = await fetch(url, { method: 'POST' });
  const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
  if (!response.ok) throw new Error(body.message || body.error || 'Something went wrong. Please try again.');
}

export function MarkReadButton({ companyId, notificationId }: { companyId: string; notificationId: string }) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return <span>
    <button
      type="button"
      className="button-link"
      disabled={!interactive || pending}
      onClick={async () => {
        setPending(true);
        setError('');
        try {
          await post(`/api/companies/${encodeURIComponent(companyId)}/notifications/${encodeURIComponent(notificationId)}/read`);
          router.refresh();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'Unable to mark this read.');
        } finally {
          setPending(false);
        }
      }}
    >{pending ? 'Marking…' : 'Mark as read'}</button>
    {error && <span className="form-error" role="alert"> {error}</span>}
  </span>;
}

export function MarkAllReadButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return <span>
    <button
      type="button"
      className="button-link"
      disabled={!interactive || pending}
      onClick={async () => {
        setPending(true);
        setError('');
        try {
          await post(`/api/companies/${encodeURIComponent(companyId)}/notifications/read-all`);
          router.refresh();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'Unable to mark these read.');
        } finally {
          setPending(false);
        }
      }}
    >{pending ? 'Marking…' : 'Mark all as read'}</button>
    {error && <span className="form-error" role="alert"> {error}</span>}
  </span>;
}

export function NotificationPreferencesForm({ companyId, initial }: {
  companyId: string; initial: NotificationPreferences;
}) {
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inAppEnabled, setInAppEnabled] = useState(initial.inAppEnabled);
  const [smsEnabled, setSmsEnabled] = useState(initial.smsEnabled);
  const [emailEnabled, setEmailEnabled] = useState(initial.emailEnabled);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/companies/${encodeURIComponent(companyId)}/notifications/preferences`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inAppEnabled, smsEnabled, emailEnabled }),
        },
      );
      const body = await response.json().catch(() => ({})) as { message?: string; error?: string };
      if (!response.ok) throw new Error(body.message || body.error || 'Unable to save preferences.');
      setNotice('Preferences saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save preferences.');
    } finally {
      setPending(false);
    }
  }

  return <form className="vehicle-form" onSubmit={save}>
    <label>
      <input type="checkbox" checked={inAppEnabled} onChange={(event) => setInAppEnabled(event.target.checked)} />
      {' '}In-app notifications (this inbox)
    </label>
    <label>
      <input type="checkbox" checked={smsEnabled} onChange={(event) => setSmsEnabled(event.target.checked)} />
      {' '}SMS notifications
    </label>
    <label>
      <input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} />
      {' '}Email notifications
    </label>
    <p className="form-help">SMS and email delivery are being rolled out; your choices are saved now and will be honoured as those channels switch on.</p>
    <div className="vehicle-form-actions">
      <button className="button-primary" type="submit" disabled={!interactive || pending}>{pending ? 'Saving…' : 'Save preferences'}</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </form>;
}
