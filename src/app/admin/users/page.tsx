import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isActiveSuperAdmin } from '@/modules/auth/permissions';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { LogoutButton } from '@/app/logout-button';

export const dynamic = 'force-dynamic';
const pageSize = 50;
type AdminUserRow = { id: string; name: string; email: string; status: string; createdAt: Date };
type UsersPageProps = { searchParams: Promise<{ q?: string; page?: string }> };

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  if (!await isActiveSuperAdmin(session.user.id)) redirect('/');

  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const requestedPage = typeof params.page === 'string' ? Number.parseInt(params.page, 10) : 0;
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? Math.min(requestedPage, 1000) : 0;
  const users = await getPrisma().user.findMany({
    where: query ? { OR: [
      { name: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
    ] } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: page * pageSize,
    take: pageSize + 1,
    select: { id: true, name: true, email: true, status: true, createdAt: true },
  });
  const hasMore = users.length > pageSize;
  const visibleUsers: AdminUserRow[] = users.slice(0, pageSize);

  return <main className="app-shell">
    <header className="app-header">
      <Link className="wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav className="account-area" aria-label="Administration navigation">
        <Link className="header-link" href="/">Workspace</Link>
        <Link className="header-link" href="/admin/settings">Policy settings</Link>
        <Link className="header-link" href="/admin/audit">Audit activity</Link>
        <span>{session.user.name || session.user.email}</span>
        <LogoutButton />
      </nav>
    </header>
    <section className="audit-content" aria-labelledby="admin-users-title">
      <div className="audit-heading">
        <div><p className="eyebrow">Administration</p><h1 id="admin-users-title">User roles</h1><p className="muted">Review existing accounts and manage approved role assignments. This screen does not create or activate accounts.</p></div>
      </div>
      <form className="fleet-search admin-user-search" method="get">
        <label htmlFor="admin-user-search">Search users by name or email</label>
        <div><input id="admin-user-search" type="search" name="q" maxLength={100} defaultValue={query} /><button className="button-link" type="submit">Search</button></div>
      </form>
      {visibleUsers.length === 0 ? <div className="audit-empty" role="status"><h2>No users found</h2><p>{query ? 'Try another name or email search.' : 'No user accounts exist yet.'}</p></div> : <div className="audit-table-wrap" role="region" aria-label="User accounts" tabIndex={0}>
        <table className="audit-table admin-user-table">
          <caption className="visually-hidden">Existing user accounts and role-management links</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Account status</th><th scope="col">Account created</th><th scope="col">Roles</th></tr></thead>
          <tbody>{visibleUsers.map((user) => <tr key={user.id}>
            <td><strong>{user.name || 'Name not recorded'}</strong></td><td>{user.email}</td><td>{user.status}</td>
            <td><time dateTime={user.createdAt.toISOString()}>{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeZone: 'Africa/Accra' }).format(user.createdAt)}</time></td>
            <td><Link className="button-link" href={`/admin/users/${encodeURIComponent(user.id)}/roles`}>Manage roles</Link></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <nav className="audit-pagination" aria-label="User account pages">
        {page > 0 && <Link className="button-link" href={`/admin/users?${query ? `q=${encodeURIComponent(query)}&` : ''}page=${page - 1}`}>Previous page</Link>}
        <span className="muted">Showing {visibleUsers.length} {visibleUsers.length === 1 ? 'account' : 'accounts'}{query ? ` matching “${query}”` : ''}</span>
        {hasMore && <Link className="button-link" href={`/admin/users?${query ? `q=${encodeURIComponent(query)}&` : ''}page=${page + 1}`}>Next page</Link>}
      </nav>
    </section>
  </main>;
}
