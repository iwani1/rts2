import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolvePermission } from '@/modules/auth/permissions';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { LogoutButton } from '@/app/logout-button';

export const dynamic = 'force-dynamic';
const pageSize = 50;

type AuditPageProps = { searchParams: Promise<{ before?: string | string[] }> };

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function summaryEntries(summary: unknown): Array<[string, unknown]> {
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
    return Object.entries(summary as Record<string, unknown>);
  }
  return summary == null ? [] : [['details', summary]];
}

function formatTimestamp(value: Date): string {
  return new Intl.DateTimeFormat('en-GH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Accra',
  }).format(value);
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const access = await resolvePermission({ userId: session.user.id, permission: 'audit:read' });
  if (!access.scopes.includes('GLOBAL')) redirect('/');

  const params = await searchParams;
  const before = typeof params.before === 'string' && params.before.length <= 64 ? params.before : undefined;
  const fetched = await getPrisma().auditEvent.findMany({
    take: pageSize + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      actor: { select: { name: true, email: true } },
      company: { select: { name: true } },
    },
  });
  const hasMore = fetched.length > pageSize;
  const events = fetched.slice(0, pageSize);
  const nextCursor = hasMore ? events.at(-1)?.id : undefined;

  return <main className="app-shell">
    <header className="app-header">
      <Link className="wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav className="account-area" aria-label="Account">
        <Link className="header-link" href="/">Workspace</Link>
        <span>{session.user.name || session.user.email}</span>
        <LogoutButton />
      </nav>
    </header>
    <section className="audit-content" aria-labelledby="audit-title">
      <div className="audit-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="audit-title">Audit activity</h1>
          <p className="muted">Recent recorded account and access changes. Times are shown in Ghana time.</p>
        </div>
      </div>

      {events.length === 0 ? <div className="audit-empty" role="status">
        <h2>No audit events yet</h2>
        <p>New recorded activity will appear here.</p>
      </div> : <>
        <div className="audit-table-wrap" role="region" aria-label="Audit events" tabIndex={0}>
          <table className="audit-table">
            <caption className="visually-hidden">Latest audit events, newest first</caption>
            <thead><tr>
              <th scope="col">Time (GMT)</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Record</th>
              <th scope="col">Company</th>
              <th scope="col">Details</th>
            </tr></thead>
            <tbody>{events.map((event) => (
              <tr key={event.id}>
                <td><time dateTime={event.createdAt.toISOString()}>{formatTimestamp(event.createdAt)}</time></td>
                <td>{event.actor ? <><strong>{event.actor.name}</strong><span className="audit-secondary">{event.actor.email}</span></> : <span className="muted">System / removed user</span>}</td>
                <td><span className="audit-action">{event.action.replaceAll('_', ' ').toLowerCase()}</span></td>
                <td><span>{event.entityType}</span><code className="audit-secondary audit-id" title={event.entityId}>{event.entityId}</code></td>
                <td>{event.company?.name ?? <span className="muted">—</span>}</td>
                <td><dl className="audit-details">{summaryEntries(event.summary).map(([key, value]) => (
                  <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{formatValue(value)}</dd></div>
                ))}</dl></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <nav className="audit-pagination" aria-label="Audit event pages">
          {before && <Link className="button-link" href="/admin/audit">Latest events</Link>}
          <span className="muted">Showing {events.length} {events.length === 1 ? 'event' : 'events'}</span>
          {nextCursor && <Link className="button-link" href={`/admin/audit?before=${encodeURIComponent(nextCursor)}`}>Older events</Link>}
        </nav>
      </>}
    </section>
  </main>;
}
