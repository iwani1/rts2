import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { getTwoFactorGate } from '@/modules/auth/two-factor-gate';
import { SecurityActions } from './security-actions';

export const dynamic = 'force-dynamic';

/** AUTH-06 (D-076): enrol in or remove two-factor authentication. */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const params = await searchParams;
  const gate = await getTwoFactorGate(session.user.id);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Account security</p>
      <h1 className="mt-1 text-3xl font-semibold text-slate-950">Two-factor authentication</h1>
      {params.required === '1' || gate.mustEnroll ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Your account has a privileged role, so two-factor authentication is required.
          Please set it up now — you will be brought back here until it is on.
        </p>
      ) : null}
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Status: <strong>{gate.enabled ? 'On' : 'Off'}</strong>
        {gate.required ? ' · Required for your role' : ' · Optional for your role'}
      </p>
      <SecurityActions enabled={gate.enabled} />
    </main>
  );
}
