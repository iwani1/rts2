import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { FleetCompanyNotFoundError, InvalidVehicleCursorError, listVehicles } from '@/modules/fleet/vehicles';
import { getVehicleDocumentDates, vehicleDocumentTypes } from '@/modules/fleet/vehicle-document-dates';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';

export const dynamic = 'force-dynamic';
type PageProps = { searchParams: Promise<{ q?: string; cursor?: string; cursorHistory?: string; type?: string }> };
function documentPageHref({ search, type, cursor, history }: { search?: string; type?: string; cursor?: string; history?: string[] }) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (type) params.set('type', type);
  if (cursor) params.set('cursor', cursor);
  if (history?.length) params.set('cursorHistory', history.join('.'));
  const query = params.toString();
  return `/fleet/vehicles/documents${query ? `?${query}` : ''}`;
}

export default async function VehicleDocumentsPage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({
    where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true },
  });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty">
    <h1>Vehicle document dates unavailable</h1>
    <p>Exactly one active operator company must be provisioned for this installation. No vehicle data was loaded.</p>
    <Link className="button-link" href="/">Back to workspace</Link>
  </section></main>;

  const params = await searchParams;
  const cursorHistory = params.cursorHistory ? params.cursorHistory.split('.') : [];
  if (cursorHistory.length > 50 || cursorHistory.some((token) => token !== 'ROOT' && !/^[A-Za-z0-9_-]{1,128}$/.test(token))) {
    redirect('/fleet/vehicles/documents');
  }
  let result: Awaited<ReturnType<typeof listVehicles>>;
  try {
    result = await listVehicles({
      actorId: session.user.id, companyId: companies[0].id, search: params.q, cursor: params.cursor,
    });
  } catch (error) {
    if (error instanceof FleetCompanyNotFoundError) notFound();
    if (error instanceof InvalidVehicleCursorError || error instanceof ZodError) redirect('/fleet/vehicles/documents');
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }
  if (!result.canManage) redirect('/fleet/vehicles');

  const selectedDocumentType = vehicleDocumentTypes.find((documentType) => documentType === params.type);
  const documents = getVehicleDocumentDates(result.vehicles, selectedDocumentType);
  const previousToken = cursorHistory[cursorHistory.length - 1];
  const previousHref = documentPageHref({ search: params.q, type: selectedDocumentType, cursor: previousToken && previousToken !== 'ROOT' ? previousToken : undefined, history: cursorHistory.slice(0, -1) });
  const nextHistory = params.cursor ? [...cursorHistory.slice(-49), params.cursor] : ['ROOT'];

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Fleet navigation">
        <Link href="/">Workspace</Link>
        <Link href="/fleet/vehicles">Vehicle register</Link>
        <span aria-current="page">Document dates</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div>
          <p className="eyebrow">{companies[0].name}</p>
          <h1>Vehicle document dates</h1>
          <p className="muted">Recorded expiry dates for insurance, roadworthiness and vehicle registration.</p>
        </div>
        <div className="fleet-title-actions">
          <Link className="button-link" href="/fleet/vehicles">Back to vehicle register</Link>
        </div>
      </div>
      <section className="fleet-list-panel" aria-labelledby="vehicle-documents-title">
        <div className="fleet-list-heading">
          <div>
            <h2 id="vehicle-documents-title">Recorded dates</h2>
            <p className="muted">Dates are entered manually. This view does not classify expiry status or send reminders.</p>
          </div>
          <form className="fleet-search vehicle-document-filters" method="get">
            <div className="vehicle-document-filter-controls">
              <label htmlFor="document-vehicle-search">Search vehicles
                <input id="document-vehicle-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Registration, make, model, category" />
              </label>
              <label htmlFor="document-type-filter">Document type
                <select id="document-type-filter" name="type" defaultValue={selectedDocumentType ?? ''}>
                  <option value="">All document types</option>
                  {vehicleDocumentTypes.map((documentType) => <option key={documentType} value={documentType}>{documentType}</option>)}
                </select>
              </label>
              <button className="button-link" type="submit">Apply filters</button>
            </div>
          </form>
        </div>
        {documents.length === 0 ? <div className="fleet-empty">
          <h3>{result.vehicles.length === 0 ? 'No vehicles found' : 'No document expiry dates on this page'}</h3>
          <p>{result.vehicles.length === 0
            ? params.q ? 'Try a different search, or clear the search term.' : 'No active vehicle records are available.'
            : `${selectedDocumentType ? `No ${selectedDocumentType} expiry dates are` : 'No approved document dates are'} recorded for these vehicles. Enter a date in the vehicle register or continue to the next page.`}</p>
          {(params.q || selectedDocumentType) && <Link className="button-link" href="/fleet/vehicles/documents">Clear filters</Link>}
        </div> : <div className="vehicle-table-wrap" role="region" aria-label="Vehicle document expiry dates" tabIndex={0}>
          <table className="vehicle-table">
            <caption className="sr-only">{selectedDocumentType ? `Recorded ${selectedDocumentType.toLowerCase()} expiry dates on this page, earliest first` : 'Recorded vehicle document expiry dates on this page, earliest first'}</caption>
            <thead><tr><th scope="col">Expiry date</th><th scope="col">Document</th><th scope="col">Vehicle</th><th scope="col">Registration</th><th scope="col">Record</th></tr></thead>
            <tbody>{documents.map((document) => <tr key={`${document.vehicleId}-${document.documentType}`}>
              <td>{document.expiryDate}</td>
              <td>{document.documentType}</td>
              <td>{document.make} {document.model}</td>
              <td><strong>{document.registrationNumber}</strong></td>
              <td><Link className="button-link vehicle-edit-link" href={`/fleet/vehicles?edit=${encodeURIComponent(document.vehicleId)}`}>Edit vehicle</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {(params.cursor || result.nextCursor) && <nav className="fleet-pagination" aria-label="Vehicle document pages">
          {params.cursor && <Link className="button-link" href={previousHref}>Previous page</Link>}
          <span className="muted">Showing document dates for up to 50 vehicles per page.</span>
          {result.nextCursor && <Link className="button-link" href={documentPageHref({ search: params.q, type: selectedDocumentType, cursor: result.nextCursor, history: nextHistory })}>Next page</Link>}
        </nav>}
      </section>
      <p className="fleet-limits">Document file uploads and automatic expiry reminders are deferred pending production storage and reminder policy decisions.</p>
    </div>
  </main>;
}
