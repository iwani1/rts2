'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function VerifyForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [useBackup, setUseBackup] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    const code = String(form.get('code') ?? '').trim();
    try {
      const result = useBackup
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code });
      if (result.error) {
        setError('That code was not accepted. Check the code and try again.');
      } else {
        router.replace('/');
        router.refresh();
      }
    } catch {
      setError('Unable to verify right now. Please try again later.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" method="post" onSubmit={submit}>
      <label htmlFor="code">{useBackup ? 'Backup code' : 'Authenticator code'}</label>
      <input
        id="code" name="code" type="text" required
        autoComplete="one-time-code"
        inputMode={useBackup ? 'text' : 'numeric'}
        maxLength={useBackup ? 32 : 6}
        placeholder={useBackup ? 'e.g. abcd-efgh' : '123456'}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? 'Verifying…' : 'Verify and sign in'}</button>
      <button
        className="form-help underline"
        onClick={() => { setUseBackup((value) => !value); setError(''); }}
        type="button"
      >
        {useBackup ? 'Use my authenticator app instead' : 'Use a backup code instead'}
      </button>
    </form>
  );
}
