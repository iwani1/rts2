'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    try {
      await authClient.signOut();
      router.replace('/login');
      router.refresh();
    } finally {
      setPending(false);
    }
  }
  return <button className="button-secondary" type="button" onClick={logout} disabled={pending}>
    {pending ? 'Signing out…' : 'Sign out'}
  </button>;
}
