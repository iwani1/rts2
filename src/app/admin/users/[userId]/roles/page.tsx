import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { isActiveSuperAdmin } from '@/modules/auth/permissions';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { LogoutButton } from '@/app/logout-button';
import { UserRoleManager } from './user-role-manager';

export const dynamic = 'force-dynamic';
type RolePageProps = { params: Promise<{ userId: string }> };

export default async function UserRolesPage({ params }: RolePageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  if (!await isActiveSuperAdmin(session.user.id)) redirect('/');
  const { userId } = await params;
  const prisma = getPrisma();
  const [user, companies] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, status: true } }),
    prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } }),
  ]);
  if (!user) notFound();
  const company = companies.length === 1 ? companies[0] : null;

  return <main className="app-shell">
    <header className="app-header">
      <Link className="wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav className="account-area" aria-label="Administration navigation">
        <Link className="header-link" href="/admin/users">User roles</Link>
        <Link className="header-link" href="/admin/settings">Policy settings</Link>
        <Link className="header-link" href="/admin/audit">Audit activity</Link>
        <span>{session.user.name || session.user.email}</span>
        <LogoutButton />
      </nav>
    </header>
    <section className="audit-content" aria-labelledby="user-role-title">
      <p className="eyebrow">Administration · Existing account</p>
      <div className="audit-heading">
        <div><h1 id="user-role-title">{user.name || 'Name not recorded'}</h1><p className="muted">{user.email} · Account status: {user.status}</p></div>
        <Link className="button-link" href="/admin/users">Back to user list</Link>
      </div>
      {user.status !== 'ACTIVE' && <p className="fleet-limits" role="status">This account is not active. Role assignments cannot be added until an account-activation workflow is approved and completed.</p>}
      {companies.length !== 1 && <p className="fleet-limits" role="status">There is not exactly one active operator company. Company-scoped role assignment is disabled; no company was selected automatically.</p>}
      <UserRoleManager targetUserId={user.id} currentUserId={session.user.id} targetIsActive={user.status === 'ACTIVE'} targetIsSelf={user.id === session.user.id} company={company ? { id: company.id, name: company.name } : null} />
    </section>
  </main>;
}
