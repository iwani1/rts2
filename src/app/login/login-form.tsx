'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await authClient.signIn.email({
        email: String(form.get('email') ?? '').trim(),
        password: String(form.get('password') ?? ''),
        callbackURL: '/',
      });
      if (result.error) {
        setError('Sign-in failed. Check your details or contact your administrator.');
      } else if (
        typeof result.data === 'object' && result.data !== null
        && (result.data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true
      ) {
        // AUTH-06 (D-076): second factor required before any session exists.
        router.replace('/login/verify');
      } else {
        router.replace('/');
        router.refresh();
      }
    } catch {
      setError('Unable to sign in right now. Please try again later.');
    } finally {
      setPending(false);
    }
  }

  return <form className="login-form" method="post" onSubmit={submit}>
    <label htmlFor="email">Email address</label>
    <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} />
    <label htmlFor="password">Password</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required minLength={12} maxLength={128} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    <p className="form-help">Account invitations and password recovery are not configured yet.</p>
  </form>;
}
