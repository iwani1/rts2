import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { FleetCompanyNotFoundError, listVehicles } from '@/modules/fleet/vehicles';
import { getVehicleDocumentDates, vehicleDocumentTypes } from '@/modules/fleet/vehicle-document-dates';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';

export const dynamic = 'force-dynamic';
type PageProps = { searchParams: Promise<{ q?: string; cursor?: string; type?: string }> };

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
  let result: Awaited<ReturnType<typeof listVehicles>>;
  try {
    result = await listVehicles({
      actorId: session.user.id, companyId: companies[0].id, search: params.q, cursor: params.cursor,
    });
  } catch (error) {
    if (error instanceof FleetCompanyNotFoundError) notFound();
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }
  if (!result.canManage) redirect('/fleet/vehicles');

  const selectedDocumentType = vehicleDocumentTypes.find((documentType) => documentType === params.type);
  const documents = getVehicleDocumentDates(result.vehicles, selectedDocumentType);
  const nextPageParams = new URLSearchParams();
  if (params.q) nextPageParams.set('q', params.q);
  if (selectedDocumentType) nextPageParams.set('type', selectedDocumentType);
  if (result.nextCursor) nextPageParams.set('cursor', result.nextCursor);

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
          <form className="fleet-search" method="get">
            <label htmlFor="document-vehicle-search">Search vehicles</label>
            <div>
              <input id="document-vehicle-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Registration, make, model, category" />
              <label htmlFor="document-type-filter">Document type</label>
              <select id="document-type-filter" name="type" defaultValue={selectedDocumentType ?? ''}>
                <option value="">All document types</option>
                {vehicleDocumentTypes.map((documentType) => <option key={documentType} value={documentType}>{documentType}</option>)}
              </select>
              <button className="button-link" type="submit">Apply filters</button>
            </div>
          </form>
        </div>
        {documents.length === 0 ? <div className="fleet-empty">
          <h3>{result.vehicles.length === 0 ? 'No vehicles found' : 'No document expiry dates on this page'}</h3>
          <p>{result.vehicles.length === 0
            ? params.q ? 'Try a different search, or clear the search term.' : 'No active vehicle records are available.'
            : `${selectedDocumentType ? `No ${selectedDocumentType} expiry dates are` : 'No approved document dates are'} recorded for these vehicles. Enter a date in the vehicle register or continue to the next page.`}</p>
        </div> : <div className="vehicle-table-wrap" role="region" aria-label="Vehicle document expiry dates" tabIndex={0}>
          <table className="vehicle-table">
            <caption className="sr-only">{selectedDocumentType ? `Recorded ${selectedDocumentType.toLowerCase()} expiry dates, earliest first` : 'Recorded vehicle document expiry dates, earliest first'}</caption>
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
        {result.nextCursor && <div className="fleet-pagination">
          <span className="muted">More vehicles are available.</span>
          <Link className="button-link" href={`/fleet/vehicles/documents?${nextPageParams.toString()}`}>Next page</Link>
        </div>}
      </section>
      <p className="fleet-limits">Document file uploads and automatic expiry reminders are deferred pending production storage and reminder policy decisions.</p>
    </div>
  </main>;
}
