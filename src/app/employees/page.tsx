import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { listClients } from '@/modules/clients/clients';
import {
  EmployeeCompanyNotFoundError,
  EmployeeNotFoundError,
  InvalidEmployeeCursorError,
  getEmployee,
  listEmployees,
} from '@/modules/employees/employees';
import type { EmployeeRecord } from '@/modules/employees/employees';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { EmployeeManager } from './employee-manager';

export const dynamic = 'force-dynamic';
const accraDateTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra',
});
type PageProps = { searchParams: Promise<{ q?: string; clientId?: string; eligible?: string; cursor?: string; cursorHistory?: string; edit?: string }> };
function employeePageHref({ search, clientId, eligible, cursor, history, edit }: { search?: string; clientId?: string; eligible?: string; cursor?: string; history?: string[]; edit?: string }) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (clientId) params.set('clientId', clientId);
  if (eligible) params.set('eligible', eligible);
  if (cursor) params.set('cursor', cursor);
  if (history?.length) params.set('cursorHistory', history.join('.'));
  if (edit) params.set('edit', edit);
  const query = params.toString();
  return `/employees${query ? `?${query}` : ''}`;
}

export default async function EmployeesPage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Employee register unavailable</h1><p>Exactly one active operator company must be provisioned for this installation.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;
  const company = companies[0];
  const params = await searchParams;
  const cursorHistory = params.cursorHistory ? params.cursorHistory.split('.') : [];
  if (cursorHistory.length > 50 || cursorHistory.some((token) => token !== 'ROOT' && !/^[A-Za-z0-9_-]{1,128}$/.test(token))) {
    redirect('/employees');
  }
  let result: Awaited<ReturnType<typeof listEmployees>>;
  let clientOptions: Array<{ id: string; name: string }> = [];
  try {
    result = await listEmployees({
      actorId: session.user.id, companyId: company.id, search: params.q,
      clientId: params.clientId, transportEligible: params.eligible, cursor: params.cursor,
    });
    const clients = await listClients({ actorId: session.user.id, companyId: company.id });
    clientOptions = clients.clients.map((client) => ({ id: client.id, name: client.name }));
  } catch (error) {
    if (error instanceof EmployeeCompanyNotFoundError) notFound();
    if (error instanceof InvalidEmployeeCursorError || error instanceof ZodError) redirect('/employees');
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }

  let editing: EmployeeRecord | undefined;
  let history: Awaited<ReturnType<typeof getEmployee>>['history'] = [];
  if (params.edit) {
    try {
      const detail = await getEmployee({ actorId: session.user.id, companyId: company.id, employeeId: params.edit });
      editing = detail.employee;
      history = detail.history;
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) notFound();
      if (error instanceof PermissionDeniedError) redirect('/employees');
      throw error;
    }
  }

  const previousToken = cursorHistory[cursorHistory.length - 1];
  const previousHref = employeePageHref({ search: params.q, clientId: params.clientId, eligible: params.eligible, cursor: previousToken && previousToken !== 'ROOT' ? previousToken : undefined, history: cursorHistory.slice(0, -1) });
  const nextHistory = params.cursor ? [...cursorHistory.slice(-49), params.cursor] : ['ROOT'];
  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Employee navigation">
        <Link href="/">Workspace</Link>
        <Link href="/clients">Corporate clients</Link>
        <Link href="/contracts">Contracts</Link>
        <span aria-current="page">Employees</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Employee register</h1><p className="muted">Corporate client employees eligible for staff transport. Home addresses, contact details and accessibility needs are restricted to authorised managers and are never shown on rosters or exports.</p></div>
        <div className="client-actions">
          <a className="button-link" href={`/api/companies/${encodeURIComponent(company.id)}/employees/export${params.clientId ? `?clientId=${encodeURIComponent(params.clientId)}` : ''}`}>Export CSV (no restricted fields)</a>
          <Link className="button-link" href="/">Back to workspace</Link>
        </div>
      </div>
      <section className="fleet-list-panel" aria-labelledby="employee-list-title">
        <div className="fleet-list-heading">
          <div><h2 id="employee-list-title">Employees</h2><p className="muted">Showing up to 50 active records per page.</p></div>
          <form className="fleet-search" method="get"><label htmlFor="employee-search">Search employees</label><div><input id="employee-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Name, reference or department"/><button className="button-link" type="submit">Search</button></div></form>
        </div>
        <form className="fleet-search" method="get" aria-label="Filter employees">
          <label htmlFor="employee-client-filter">Client</label>
          <div>
            <select id="employee-client-filter" name="clientId" defaultValue={params.clientId ?? ''}>
              <option value="">All clients</option>
              {clientOptions.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            <label htmlFor="employee-eligible-filter">Transport eligibility</label>
            <select id="employee-eligible-filter" name="eligible" defaultValue={params.eligible ?? ''}>
              <option value="">Any</option>
              <option value="true">Eligible</option>
              <option value="false">Not eligible</option>
            </select>
            <button className="button-link" type="submit">Filter</button>
          </div>
        </form>
        {result.employees.length === 0 ? <div className="fleet-empty"><h3>No employees found</h3><p>{params.q || params.clientId || params.eligible ? <>Try different filters. <Link className="button-link" href="/employees">Clear filters</Link></> : 'No employee records have been entered yet.'}</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Employee records" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Employee register records</caption><thead><tr><th scope="col">Employee</th><th scope="col">Client</th><th scope="col">Department</th><th scope="col">Shift</th><th scope="col">Eligibility</th><th scope="col">Record</th></tr></thead>
            <tbody>{result.employees.map((employee) => <tr key={employee.id}>
              <td><strong>{employee.fullName}</strong><span className="vehicle-secondary">{employee.reference ?? 'No reference recorded'}</span></td>
              <td>{employee.clientName}</td>
              <td>{employee.department ?? 'Not recorded'}</td>
              <td>{employee.shift ?? 'Not recorded'}</td>
              <td>{employee.transportEligible === null ? 'Not recorded' : employee.transportEligible ? 'Eligible' : 'Not eligible'}</td>
              <td><Link className="button-link vehicle-edit-link" href={employeePageHref({ search: params.q, clientId: params.clientId, eligible: params.eligible, cursor: params.cursor, history: cursorHistory, edit: employee.id })}>Edit / history</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {(params.cursor || result.nextCursor) && <nav className="fleet-pagination" aria-label="Employee pages">
          {params.cursor && <Link className="button-link" href={previousHref}>Previous page</Link>}
          <span className="muted">Showing up to 50 employees per page.</span>
          {result.nextCursor && <Link className="button-link" href={employeePageHref({ search: params.q, clientId: params.clientId, eligible: params.eligible, cursor: result.nextCursor, history: nextHistory })}>Next page</Link>}
        </nav>}
      </section>
      {result.canManage && <EmployeeManager companyId={company.id} clients={clientOptions} employee={editing} />}
      {editing && <section className="fleet-list-panel" aria-labelledby="employee-history-title">
        <div className="fleet-list-heading"><div><h2 id="employee-history-title">Employee history</h2><p className="muted">Audit events for this record; personal details are not copied into the event summaries.</p></div></div>
        {history.length === 0 ? <p className="fleet-empty">No history recorded.</p> : <ol className="client-history-list">{history.map((event, index) => <li key={`${event.createdAt.toISOString()}-${event.action}-${index}`}><strong>{event.action.replaceAll('_', ' ')}</strong><span>{accraDateTime.format(event.createdAt)} · {event.actorName}</span>{event.reason && <p>{event.reason}</p>}</li>)}</ol>}
      </section>}
      <p className="fleet-limits">Shifts are recorded as supplied by the client until shift definitions are configured in Settings. Pickup and drop-off locations are recorded as landmark descriptions until the structured location register (RTE-01) is available. Bookings are not yet implemented.</p>
    </div>
  </main>;
}
