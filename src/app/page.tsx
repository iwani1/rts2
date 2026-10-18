import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { mayStartSession } from '@/modules/auth/policy';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { LogoutButton } from './logout-button';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const currentUser = await getPrisma().user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(currentUser?.status)) redirect('/login');
  return <main className="app-shell">
    <header className="app-header">
      <Link className="wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <div className="account-area"><span>{session.user.name || session.user.email}</span><LogoutButton /></div>
    </header>
    <section className="welcome-panel">
      <p className="eyebrow">Operations workspace</p>
      <h1>Welcome, {session.user.name || 'team member'}</h1>
      <p>Your account is authenticated. Operational modules will appear here as each verified workflow is implemented.</p>
      <p className="notice">Phase 1A is in progress. Fleet, rental and finance workflows are not available yet.</p>
    </section>
  </main>;
}
