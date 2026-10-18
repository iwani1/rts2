import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { mayStartSession } from '@/modules/auth/policy';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { ChangePasswordForm } from './change-password-form';

export const dynamic = 'force-dynamic';

export default async function AccountSecurityPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const user = await getPrisma().user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');

  return <main className="login-shell">
    <section className="login-panel" aria-labelledby="security-title">
      <p className="eyebrow">Account security</p>
      <h1 id="security-title">Change your password</h1>
      <p className="muted">Use your current password and choose a new, unique password. Other active sessions will be revoked.</p>
      <ChangePasswordForm />
      <p className="form-help"><Link href="/">Back to workspace</Link></p>
    </section>
  </main>;
}
