'use client';

import { FormEvent, useState } from 'react';

export function ChangePasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setPending(true);
    const targetForm = event.currentTarget;
    const form = new FormData(targetForm);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');
    if (newPassword !== confirmPassword) {
      setError('The new password entries do not match.');
      setPending(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, revokeOtherSessions: true }),
      });
      if (!response.ok) throw new Error('Password change failed. Check the current password and try again.');
      targetForm.reset();
      setSuccess('Password changed. Other active sessions have been signed out.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Password change failed. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return <form className="login-form" method="post" onSubmit={submit}>
    <label htmlFor="current-password">Current password</label>
    <input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
    <label htmlFor="new-password">New password</label>
    <input id="new-password" name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
    <label htmlFor="confirm-password">Confirm new password</label>
    <input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
    <p className="form-help">Choose a unique password of at least 12 characters. It is submitted in a POST request, never in the URL.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <p className="form-success" role="status">{success}</p>}
    <button type="submit" disabled={pending}>{pending ? 'Changing password…' : 'Change password'}</button>
  </form>;
}
