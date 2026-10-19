import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { getRentalRequest, listRentalRequests, RentalCompanyNotFoundError, RentalRequestNotFoundError } from '@/modules/rentals/rental-requests';
import type { RentalRequestRecord } from '@/modules/rentals/rental-requests';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { RequestManager } from './request-manager';

export const dynamic = 'force-dynamic';
type PageProps = { searchParams: Promise<{ q?: string; cursor?: string; edit?: string }> };
const accraDateTime = new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra' });

export default async function RentalRequestsPage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Rental requests unavailable</h1><p>Exactly one active operator company must be provisioned for this installation.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;
  const company = companies[0];
  const params = await searchParams;
  let result: Awaited<ReturnType<typeof listRentalRequests>>;
  try {
    result = await listRentalRequests({ actorId: session.user.id, companyId: company.id, search: params.q, cursor: params.cursor });
  } catch (error) {
    if (error instanceof RentalCompanyNotFoundError) notFound();
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }

  let editing: RentalRequestRecord | undefined;
  let history: Awaited<ReturnType<typeof getRentalRequest>>['history'] = [];
  if (params.edit) {
    try {
      const detail = await getRentalRequest({ actorId: session.user.id, companyId: company.id, requestId: params.edit });
      editing = detail.request;
      history = detail.history;
    } catch (error) {
      if (error instanceof RentalRequestNotFoundError) notFound();
      if (error instanceof PermissionDeniedError) redirect('/rentals/requests');
      throw error;
    }
  }

  const customerAccess = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'customer:manage' });
  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Rental and customer navigation">
        <Link href="/">Workspace</Link>
        <Link href="/customers">Customer register</Link>
        <span aria-current="page">Rental requests</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Rental requests</h1><p className="muted">Record phone, email or other enquiries as Drafts linked to an existing customer.</p></div>
        <Link className="button-link" href="/">Back to workspace</Link>
      </div>
      <section className="fleet-list-panel" aria-labelledby="request-list-title">
        <div className="fleet-list-heading">
          <div><h2 id="request-list-title">Requests</h2><p className="muted">Showing up to 50 requests per page.</p></div>
          <form className="fleet-search" method="get"><label htmlFor="request-search">Search requests</label><div><input id="request-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Customer, pickup or destination"/><button className="button-link" type="submit">Search</button></div></form>
        </div>
        {result.requests.length === 0 ? <div className="fleet-empty"><h3>No rental requests found</h3><p>{params.q ? 'Try another search or clear the search term.' : 'No requests have been recorded yet.'}</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Rental request records" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Rental request records</caption><thead><tr><th scope="col">Customer</th><th scope="col">Service date</th><th scope="col">Journey</th><th scope="col">Status</th><th scope="col">Record</th></tr></thead>
            <tbody>{result.requests.map((request) => <tr key={request.id}>
              <td><strong>{request.customerName}</strong></td>
              <td>{request.serviceDate ?? 'Not recorded'}{request.departureTime && <span className="vehicle-secondary">Departure: {request.departureTime}</span>}</td>
              <td>{request.pickupLocation ?? 'Pickup not recorded'} → {request.destination ?? 'Destination not recorded'}{request.returnTime && <span className="vehicle-secondary">Return: {request.returnTime}</span>}</td>
              <td><span className="request-status">{request.status}</span></td>
              <td><Link className="button-link vehicle-edit-link" href={`/rentals/requests?edit=${encodeURIComponent(request.id)}${params.q ? `&q=${encodeURIComponent(params.q)}` : ''}`}>View / edit</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {result.nextCursor && <div className="fleet-pagination"><span className="muted">More requests available.</span><Link className="button-link" href={`/rentals/requests?${params.q ? `q=${encodeURIComponent(params.q)}&` : ''}cursor=${encodeURIComponent(result.nextCursor)}`}>Next page</Link></div>}
      </section>
      {result.canManage && (!editing || editing.status === 'Draft') && <RequestManager companyId={company.id} request={editing} />}
      {editing && editing.status !== 'Draft' && <p className="fleet-limits">This request has been submitted. Further status actions are not implemented.</p>}
      {editing && <section className="fleet-list-panel" aria-labelledby="request-history-title">
        <div className="fleet-list-heading"><div><h2 id="request-history-title">Status history</h2><p className="muted">This record is currently editable only while it remains a Draft.</p></div></div>
        <ol className="customer-history-list">{history.map((entry, index) => <li key={`${entry.createdAt.toISOString()}-${index}`}><strong>{entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : `Created as ${entry.toStatus}`}</strong><span>{accraDateTime.format(entry.createdAt)} · {entry.actorName}</span><p>{entry.reason}</p></li>)}</ol>
      </section>}
      <p className="fleet-limits">Draft creation/editing and the approved Draft → Submitted action are available. Further transitions, quotations, availability checks, assignments, reservations, cancellations and dispatch are not implemented. {customerAccess.allowed ? '' : 'Customer record access is not granted to this role.'}</p>
    </div>
  </main>;
}
