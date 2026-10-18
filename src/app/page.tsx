import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolvePermission } from '@/modules/auth/permissions';
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
  const auditAccess = await resolvePermission({ userId: session.user.id, permission: 'audit:read' });
  return <main className="app-shell">
    <header className="app-header">
      <Link className="wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav className="account-area" aria-label="Account">
        {auditAccess.scopes.includes('GLOBAL') && <Link className="header-link" href="/admin/audit">Audit activity</Link>}
        <span>{session.user.name || session.user.email}</span>
        <LogoutButton />
      </nav>
    </header>
    <section className="welcome-panel">
      <p className="eyebrow">Operations workspace</p>
      <h1>Welcome, {session.user.name || 'team member'}</h1>
      <p>Your account is authenticated. Operational modules will appear here as each verified workflow is implemented.</p>
      <p className="notice">Phase 1A is in progress. Fleet, rental and finance workflows are not available yet.</p>
    </section>
  </main>;
}
