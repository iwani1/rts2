import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { ClientCompanyNotFoundError, ClientNotFoundError, InvalidClientCursorError, getClient, listClients } from '@/modules/clients/clients';
import type { ClientRecord } from '@/modules/clients/clients';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { ClientManager } from './client-manager';

export const dynamic = 'force-dynamic';
type PageProps = { searchParams: Promise<{ q?: string; cursor?: string; cursorHistory?: string; edit?: string }> };
function clientPageHref({ search, cursor, history, edit }: { search?: string; cursor?: string; history?: string[]; edit?: string }) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (cursor) params.set('cursor', cursor);
  if (history?.length) params.set('cursorHistory', history.join('.'));
  if (edit) params.set('edit', edit);
  const query = params.toString();
  return `/clients${query ? `?${query}` : ''}`;
}
const accraDateTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra',
});

export default async function ClientsPage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Corporate client register unavailable</h1><p>Exactly one active operator company must be provisioned for this installation.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;
  const company = companies[0];
  const params = await searchParams;
  const cursorHistory = params.cursorHistory ? params.cursorHistory.split('.') : [];
  if (cursorHistory.length > 50 || cursorHistory.some((token) => token !== 'ROOT' && !/^[A-Za-z0-9_-]{1,128}$/.test(token))) {
    redirect('/clients');
  }
  let result: Awaited<ReturnType<typeof listClients>>;
  try {
    result = await listClients({ actorId: session.user.id, companyId: company.id, search: params.q, cursor: params.cursor });
  } catch (error) {
    if (error instanceof ClientCompanyNotFoundError) notFound();
    if (error instanceof InvalidClientCursorError || error instanceof ZodError) redirect('/clients');
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }

  let editing: ClientRecord | undefined;
  let history: Awaited<ReturnType<typeof getClient>>['history'] = [];
  if (params.edit) {
    try {
      const detail = await getClient({ actorId: session.user.id, companyId: company.id, clientId: params.edit });
      editing = detail.client;
      history = detail.history;
    } catch (error) {
      if (error instanceof ClientNotFoundError) notFound();
      if (error instanceof PermissionDeniedError) redirect('/clients');
      throw error;
    }
  }

  const fleetAccess = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'fleet:manage' });
  const driverAccess = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'driver:manage' });
  const previousToken = cursorHistory[cursorHistory.length - 1];
  const previousHref = clientPageHref({ search: params.q, cursor: previousToken && previousToken !== 'ROOT' ? previousToken : undefined, history: cursorHistory.slice(0, -1) });
  const nextHistory = params.cursor ? [...cursorHistory.slice(-49), params.cursor] : ['ROOT'];
  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Corporate client and fleet navigation">
        <Link href="/">Workspace</Link>
        {fleetAccess.allowed && <Link href="/fleet/vehicles">Vehicle register</Link>}
        {driverAccess.allowed && <Link href="/fleet/drivers">Driver register</Link>}
        <span aria-current="page">Corporate clients</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Corporate client register</h1><p className="muted">Organisation client records for staff transport contracts and billing. Only client details entered by authorised staff are shown.</p></div>
        <div className="client-actions">
          <Link className="button-link" href="/">Back to workspace</Link>
        </div>
      </div>
      <section className="fleet-list-panel" aria-labelledby="client-list-title">
        <div className="fleet-list-heading">
          <div><h2 id="client-list-title">Corporate clients</h2><p className="muted">Showing up to 50 active records per page.</p></div>
          <form className="fleet-search" method="get"><label htmlFor="client-search">Search clients</label><div><input id="client-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Name, contact or email"/><button className="button-link" type="submit">Search</button></div></form>
        </div>
        {result.clients.length === 0 ? <div className="fleet-empty"><h3>No clients found</h3><p>{params.q ? <>Try a different search or clear the search term. <Link className="button-link" href="/clients">Clear search</Link></> : 'No corporate client records have been entered yet.'}</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Client records" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Corporate client register records</caption><thead><tr><th scope="col">Client</th><th scope="col">Contact</th><th scope="col">Status</th><th scope="col">Record</th></tr></thead>
            <tbody>{result.clients.map((client) => <tr key={client.id}>
              <td><strong>{client.name}</strong><span className="vehicle-secondary">{client.registrationDetails ?? 'No registration details recorded'}</span></td>
              <td>{client.contactPerson ?? 'No contact person recorded'}{client.telephone && <span className="vehicle-secondary">{client.telephone}</span>}{client.email && <span className="vehicle-secondary">{client.email}</span>}</td>
              <td>{client.status ?? 'Not recorded'}</td>
              <td><Link className="button-link vehicle-edit-link" href={clientPageHref({ search: params.q, cursor: params.cursor, history: cursorHistory, edit: client.id })}>Edit / history</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {(params.cursor || result.nextCursor) && <nav className="fleet-pagination" aria-label="Client pages">
          {params.cursor && <Link className="button-link" href={previousHref}>Previous page</Link>}
          <span className="muted">Showing up to 50 clients per page.</span>
          {result.nextCursor && <Link className="button-link" href={clientPageHref({ search: params.q, cursor: result.nextCursor, history: nextHistory })}>Next page</Link>}
        </nav>}
      </section>
      {result.canManage && <ClientManager companyId={company.id} client={editing} />}
      {editing && <section className="fleet-list-panel" aria-labelledby="client-history-title">
        <div className="fleet-list-heading"><div><h2 id="client-history-title">Client history</h2><p className="muted">Audit events for this record; personal details are not copied into the event summaries.</p></div></div>
        {history.length === 0 ? <p className="fleet-empty">No history recorded.</p> : <ol className="client-history-list">{history.map((event, index) => <li key={`${event.createdAt.toISOString()}-${event.action}-${index}`}><strong>{event.action.replaceAll('_', ' ')}</strong><span>{accraDateTime.format(event.createdAt)} · {event.actorName}</span>{event.reason && <p>{event.reason}</p>}</li>)}</ol>}
      </section>}
      <p className="fleet-limits">Contract assignment, employee registration and corporate invoicing for this client are not yet implemented pending Phase 1B downstream workflow implementation.</p>
    </div>
  </main>;
}
