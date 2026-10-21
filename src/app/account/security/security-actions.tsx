'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

const fieldClass = 'rounded-md border border-slate-300 px-3 py-2';

function secretFromTotpUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? uri;
  } catch {
    return uri;
  }
}

/**
 * AUTH-06 (D-076): TOTP enrolment (password → secret → verify) and removal.
 * Backup codes are shown once, at enrolment.
 */
export function SecurityActions({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (enabled) {
    return (
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-700">
          Two-factor authentication is on for your account. At sign-in you will be asked for a
          code from your authenticator app (or a backup code).
        </p>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = await authClient.twoFactor.disable({ password });
              if (result.error) {
                setError('Your password was not accepted, so 2FA stays on.');
                return;
              }
              setMessage('Two-factor authentication is off.');
              router.refresh();
            });
          }}
        >
          <label className="grid gap-1 text-sm text-slate-700">
            Current password (to turn 2FA off)
            <input className={fieldClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} />
          </label>
          <div>
            <button className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50" disabled={busy} type="submit">
              {busy ? 'Working…' : 'Turn off 2FA'}
            </button>
          </div>
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          {message ? <p className="text-sm text-slate-700" role="status">{message}</p> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
      {!totpUri ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = await authClient.twoFactor.enable({ password });
              if (result.error || !result.data || result.data.method !== 'totp') {
                setError('Your password was not accepted. Check it and try again.');
                return;
              }
              setTotpUri(result.data.totpURI);
              setBackupCodes(result.data.backupCodes ?? []);
              setMessage('Now add the secret to your authenticator app and enter the code it shows.');
            });
          }}
        >
          <p className="text-sm text-slate-700">
            You need an authenticator app (e.g. Google Authenticator, Microsoft Authenticator,
            or Authy) on your phone.
          </p>
          <label className="grid gap-1 text-sm text-slate-700">
            Current password
            <input className={fieldClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} />
          </label>
          <div>
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} type="submit">
              {busy ? 'Working…' : 'Start setup'}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-slate-700">
            Add this secret to your authenticator app (type it in, or scan the code if your app
            can read the link):
          </p>
          <p className="rounded-md bg-slate-50 px-3 py-2 font-mono text-sm tracking-widest">
            {secretFromTotpUri(totpUri)}
          </p>
          <p className="break-all font-mono text-xs text-slate-500">{totpUri}</p>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const result = await authClient.twoFactor.verifyTotp({ code: code.trim() });
                if (result.error) {
                  setError('That code was not accepted. Wait for a fresh code and try again.');
                  return;
                }
                setMessage('Two-factor authentication is now on.');
                router.refresh();
              });
            }}
          >
            <label className="grid gap-1 text-sm text-slate-700">
              Code from the app
              <input className={fieldClass} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))} required />
            </label>
            <div>
              <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busy} type="submit">
                {busy ? 'Verifying…' : 'Confirm and turn on'}
              </button>
            </div>
          </form>
          {backupCodes.length > 0 ? (
            <div className="rounded-md bg-amber-50 px-3 py-2">
              <p className="text-sm font-medium text-amber-900">
                Save these one-time backup codes somewhere safe. Each works once if you lose your phone.
                They will not be shown again.
              </p>
              <p className="mt-2 font-mono text-sm">{backupCodes.join('  ·  ')}</p>
            </div>
          ) : null}
        </div>
      )}
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {message ? <p className="text-sm text-slate-700" role="status">{message}</p> : null}
    </div>
  );
}
