import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { listClients } from '@/modules/clients/clients';
import {
  ContractCompanyNotFoundError,
  ContractNotFoundError,
  InvalidContractCursorError,
  getContract,
  listContracts,
} from '@/modules/contracts/contracts';
import type { ContractRecord } from '@/modules/contracts/contracts';
import { CONTRACT_STATUSES } from '@/modules/contracts/contract-transitions';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { ContractManager } from './contract-manager';

export const dynamic = 'force-dynamic';
const accraDateTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra',
});
type PageProps = { searchParams: Promise<{ q?: string; status?: string; cursor?: string; cursorHistory?: string; edit?: string }> };
function contractPageHref({ search, status, cursor, history, edit }: { search?: string; status?: string; cursor?: string; history?: string[]; edit?: string }) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (status) params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  if (history?.length) params.set('cursorHistory', history.join('.'));
  if (edit) params.set('edit', edit);
  const query = params.toString();
  return `/contracts${query ? `?${query}` : ''}`;
}

export default async function ContractsPage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Contract register unavailable</h1><p>Exactly one active operator company must be provisioned for this installation.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;
  const company = companies[0];
  const params = await searchParams;
  const cursorHistory = params.cursorHistory ? params.cursorHistory.split('.') : [];
  if (cursorHistory.length > 50 || cursorHistory.some((token) => token !== 'ROOT' && !/^[A-Za-z0-9_-]{1,128}$/.test(token))) {
    redirect('/contracts');
  }
  let result: Awaited<ReturnType<typeof listContracts>>;
  let clientOptions: Array<{ id: string; name: string }> = [];
  try {
    result = await listContracts({ actorId: session.user.id, companyId: company.id, search: params.q, status: params.status, cursor: params.cursor });
    const clients = await listClients({ actorId: session.user.id, companyId: company.id });
    clientOptions = clients.clients.map((client) => ({ id: client.id, name: client.name }));
  } catch (error) {
    if (error instanceof ContractCompanyNotFoundError) notFound();
    if (error instanceof InvalidContractCursorError || error instanceof ZodError) redirect('/contracts');
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }

  let editing: ContractRecord | undefined;
  let history: Awaited<ReturnType<typeof getContract>>['history'] = [];
  if (params.edit) {
    try {
      const detail = await getContract({ actorId: session.user.id, companyId: company.id, contractId: params.edit });
      editing = detail.contract;
      history = detail.history;
    } catch (error) {
      if (error instanceof ContractNotFoundError) notFound();
      if (error instanceof PermissionDeniedError) redirect('/contracts');
      throw error;
    }
  }

  const previousToken = cursorHistory[cursorHistory.length - 1];
  const previousHref = contractPageHref({ search: params.q, status: params.status, cursor: previousToken && previousToken !== 'ROOT' ? previousToken : undefined, history: cursorHistory.slice(0, -1) });
  const nextHistory = params.cursor ? [...cursorHistory.slice(-49), params.cursor] : ['ROOT'];
  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Contract navigation">
        <Link href="/">Workspace</Link>
        <Link href="/clients">Corporate clients</Link>
        <span aria-current="page">Contracts</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Contracts</h1><p className="muted">Corporate service contracts and their approval lifecycle. Only terms entered by authorised staff are shown; pricing and billing values are recorded as agreed text until contract pricing is configured.</p></div>
        <div className="client-actions">
          <Link className="button-link" href="/">Back to workspace</Link>
        </div>
      </div>
      <section className="fleet-list-panel" aria-labelledby="contract-list-title">
        <div className="fleet-list-heading">
          <div><h2 id="contract-list-title">Contracts</h2><p className="muted">Showing up to 50 records per page, newest first.</p></div>
          <form className="fleet-search" method="get"><label htmlFor="contract-search">Search contracts</label><div><input id="contract-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Reference, client or service"/><button className="button-link" type="submit">Search</button></div></form>
        </div>
        <form className="fleet-search" method="get" aria-label="Filter contracts by status">
          <label htmlFor="contract-status-filter">Status</label>
          <div>
            <select id="contract-status-filter" name="status" defaultValue={params.status ?? ''}>
              <option value="">All statuses</option>
              {CONTRACT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <button className="button-link" type="submit">Filter</button>
          </div>
        </form>
        {result.contracts.length === 0 ? <div className="fleet-empty"><h3>No contracts found</h3><p>{params.q || params.status ? <>Try a different search or filter. <Link className="button-link" href="/contracts">Clear search and filters</Link></> : 'No contracts have been entered yet.'}</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Contract records" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Contract records</caption><thead><tr><th scope="col">Reference</th><th scope="col">Client</th><th scope="col">Service</th><th scope="col">Term</th><th scope="col">Status</th><th scope="col">Record</th></tr></thead>
            <tbody>{result.contracts.map((contract) => <tr key={contract.id}>
              <td><strong>{contract.reference}</strong></td>
              <td>{contract.clientName}{contract.clientArchived && <span className="vehicle-secondary">Client archived</span>}</td>
              <td>{contract.serviceType ?? 'Not recorded'}</td>
              <td>{contract.startDate ?? '…'} to {contract.endDate ?? '…'}</td>
              <td>{contract.status}{contract.warnings.length > 0 && <span className="vehicle-secondary" role="status">{contract.warnings[0]}</span>}</td>
              <td><Link className="button-link vehicle-edit-link" href={contractPageHref({ search: params.q, status: params.status, cursor: params.cursor, history: cursorHistory, edit: contract.id })}>View / history</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {(params.cursor || result.nextCursor) && <nav className="fleet-pagination" aria-label="Contract pages">
          {params.cursor && <Link className="button-link" href={previousHref}>Previous page</Link>}
          <span className="muted">Showing up to 50 contracts per page.</span>
          {result.nextCursor && <Link className="button-link" href={contractPageHref({ search: params.q, status: params.status, cursor: result.nextCursor, history: nextHistory })}>Next page</Link>}
        </nav>}
      </section>
      {result.canManage && <ContractManager companyId={company.id} clients={clientOptions} contract={editing} />}
      {editing && <section className="fleet-list-panel" aria-labelledby="contract-history-title">
        <div className="fleet-list-heading"><div><h2 id="contract-history-title">Approval and status history — {editing.reference}</h2><p className="muted">Every status change with its recorded reason. Contract terms are not copied into this history.</p></div></div>
        {editing.warnings.length > 0 && <ul>{editing.warnings.map((warning) => <li key={warning} role="status">{warning}</li>)}</ul>}
        {history.length === 0 ? <p className="fleet-empty">No history recorded.</p> : <ol className="client-history-list">{history.map((event, index) => <li key={`${event.createdAt.toISOString()}-${event.toStatus}-${index}`}><strong>{event.fromStatus ? `${event.fromStatus} → ${event.toStatus}` : event.toStatus}</strong><span>{accraDateTime.format(event.createdAt)} · {event.actorName}</span>{event.reason && <p>{event.reason}</p>}</li>)}</ol>}
      </section>}
      <p className="fleet-limits">Contract attachments and automatic renewal reminders are not available: no file-storage provider or reminder delivery channel is configured. Renewal review dates are recorded on each contract and shown here. Bookings, invoicing and route schedules link to contracts in later Phase 1B slices.</p>
    </div>
  </main>;
}
