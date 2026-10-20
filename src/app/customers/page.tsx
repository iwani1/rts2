import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { CustomerCompanyNotFoundError, CustomerNotFoundError, InvalidCustomerCursorError, getCustomer, listCustomers } from '@/modules/customers/customers';
import type { CustomerRecord } from '@/modules/customers/customers';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { CustomerManager } from './customer-manager';

export const dynamic = 'force-dynamic';
type PageProps = { searchParams: Promise<{ q?: string; cursor?: string; cursorHistory?: string; edit?: string }> };
function customerPageHref({ search, cursor, history, edit }: { search?: string; cursor?: string; history?: string[]; edit?: string }) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (cursor) params.set('cursor', cursor);
  if (history?.length) params.set('cursorHistory', history.join('.'));
  if (edit) params.set('edit', edit);
  const query = params.toString();
  return `/customers${query ? `?${query}` : ''}`;
}
const accraDateTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra',
});

export default async function CustomersPage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Customer register unavailable</h1><p>Exactly one active operator company must be provisioned for this installation.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;
  const company = companies[0];
  const params = await searchParams;
  const cursorHistory = params.cursorHistory ? params.cursorHistory.split('.') : [];
  if (cursorHistory.length > 50 || cursorHistory.some((token) => token !== 'ROOT' && !/^[A-Za-z0-9_-]{1,128}$/.test(token))) {
    redirect('/customers');
  }
  let result: Awaited<ReturnType<typeof listCustomers>>;
  try {
    result = await listCustomers({ actorId: session.user.id, companyId: company.id, search: params.q, cursor: params.cursor });
  } catch (error) {
    if (error instanceof CustomerCompanyNotFoundError) notFound();
    if (error instanceof InvalidCustomerCursorError || error instanceof ZodError) redirect('/customers');
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }

  let editing: CustomerRecord | undefined;
  let history: Awaited<ReturnType<typeof getCustomer>>['history'] = [];
  if (params.edit) {
    try {
      const detail = await getCustomer({ actorId: session.user.id, companyId: company.id, customerId: params.edit });
      editing = detail.customer;
      history = detail.history;
    } catch (error) {
      if (error instanceof CustomerNotFoundError) notFound();
      if (error instanceof PermissionDeniedError) redirect('/customers');
      throw error;
    }
  }

  const vehicleAccess = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'fleet:manage' });
  const driverAccess = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'driver:manage' });
  const previousToken = cursorHistory[cursorHistory.length - 1];
  const previousHref = customerPageHref({ search: params.q, cursor: previousToken && previousToken !== 'ROOT' ? previousToken : undefined, history: cursorHistory.slice(0, -1) });
  const nextHistory = params.cursor ? [...cursorHistory.slice(-49), params.cursor] : ['ROOT'];
  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Customer and fleet navigation">
        <Link href="/">Workspace</Link>
        {vehicleAccess.allowed && <Link href="/fleet/vehicles">Vehicle register</Link>}
        {driverAccess.allowed && <Link href="/fleet/drivers">Driver register</Link>}
        <span aria-current="page">Customer register</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Customer register</h1><p className="muted">Individual and organisation customer records for staff enquiries. Only customer details entered by authorised staff are shown.</p></div>
        <div className="customer-actions">
          {result.canManage && <Link className="button-link" href="/customers/import">Import customers from CSV</Link>}
          <Link className="button-link" href="/">Back to workspace</Link>
        </div>
      </div>
      <section className="fleet-list-panel" aria-labelledby="customer-list-title">
        <div className="fleet-list-heading">
          <div><h2 id="customer-list-title">Customers</h2><p className="muted">Showing up to 50 active records per page.</p></div>
          <form className="fleet-search" method="get"><label htmlFor="customer-search">Search customers</label><div><input id="customer-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Name, reference or contact"/><button className="button-link" type="submit">Search</button></div></form>
        </div>
        {result.customers.length === 0 ? <div className="fleet-empty"><h3>No customers found</h3><p>{params.q ? <>Try a different search or clear the search term. <Link className="button-link" href="/customers">Clear search</Link></> : 'No customer records have been entered yet.'}</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Customer records" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Customer register records</caption><thead><tr><th scope="col">Customer</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Contact</th><th scope="col">Record</th></tr></thead>
            <tbody>{result.customers.map((customer) => <tr key={customer.id}>
              <td><strong>{customer.displayName}</strong><span className="vehicle-secondary">{customer.reference ?? 'No reference recorded'}</span></td>
              <td>{customer.customerType ?? 'Not recorded'}</td><td>{customer.status ?? 'Not recorded'}</td>
              <td>{customer.contactPerson ?? 'No contact person recorded'}{customer.telephone && <span className="vehicle-secondary">{customer.telephone}</span>}{customer.email && <span className="vehicle-secondary">{customer.email}</span>}</td>
              <td><Link className="button-link vehicle-edit-link" href={customerPageHref({ search: params.q, cursor: params.cursor, history: cursorHistory, edit: customer.id })}>Edit / history</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {(params.cursor || result.nextCursor) && <nav className="fleet-pagination" aria-label="Customer pages">
          {params.cursor && <Link className="button-link" href={previousHref}>Previous page</Link>}
          <span className="muted">Showing up to 50 customers per page.</span>
          {result.nextCursor && <Link className="button-link" href={customerPageHref({ search: params.q, cursor: result.nextCursor, history: nextHistory })}>Next page</Link>}
        </nav>}
      </section>
      {result.canManage && <CustomerManager companyId={company.id} customer={editing} />}
      {editing && <section className="fleet-list-panel" aria-labelledby="customer-history-title">
        <div className="fleet-list-heading"><div><h2 id="customer-history-title">Customer history</h2><p className="muted">Audit events for this record; personal details are not copied into the event summaries.</p></div></div>
        {history.length === 0 ? <p className="fleet-empty">No history recorded.</p> : <ol className="customer-history-list">{history.map((event, index) => <li key={`${event.createdAt.toISOString()}-${event.action}-${index}`}><strong>{event.action.replaceAll('_', ' ')}</strong><span>{accraDateTime.format(event.createdAt)} · {event.actorName}</span>{event.reason && <p>{event.reason}</p>}</li>)}</ol>}
      </section>}
      <p className="fleet-limits">Dispatcher enquiry and Finance billing projections, rental-customer own-profile access, and customer-to-rental workflows are fail-closed or not yet implemented pending field-scope and downstream workflow implementation.</p>
    </div>
  </main>;
}
