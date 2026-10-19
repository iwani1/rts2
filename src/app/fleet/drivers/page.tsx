import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { DriverCompanyNotFoundError, DriverNotFoundError, getDriver, listDrivers } from '@/modules/fleet/drivers';
import type { DriverRecord } from '@/modules/fleet/drivers';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { DriverManager } from './driver-manager';

export const dynamic = 'force-dynamic';
type PageProps = { searchParams: Promise<{ q?: string; cursor?: string; edit?: string }> };

export default async function DriversPage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Driver register unavailable</h1><p>Exactly one active operator company must be provisioned for this installation.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;
  const company = companies[0];
  const params = await searchParams;
  let result: Awaited<ReturnType<typeof listDrivers>>;
  try {
    result = await listDrivers({ actorId: session.user.id, companyId: company.id, search: params.q, cursor: params.cursor });
  } catch (error) {
    if (error instanceof DriverCompanyNotFoundError) notFound();
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }
  let editing: DriverRecord | undefined;
  if (params.edit) {
    if (!result.canManage) redirect('/fleet/drivers');
    try {
      editing = (await getDriver({ actorId: session.user.id, companyId: company.id, driverId: params.edit })).driver;
    } catch (error) {
      if (error instanceof DriverNotFoundError) notFound();
      if (error instanceof PermissionDeniedError) redirect('/fleet/drivers');
      throw error;
    }
  }
  const vehicleAccess = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'fleet:manage' });

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Fleet navigation">
        <Link href="/">Workspace</Link>
        {vehicleAccess.allowed && <Link href="/fleet/vehicles">Vehicle register</Link>}
        <span aria-current="page">Driver register</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Driver register</h1><p className="muted">The approved driver register fields are shown here. Personal contact details and notes are not collected.</p></div>
        <div className="fleet-title-actions">{result.canManage && <Link className="button-primary" href="/fleet/drivers/import">Import drivers</Link>}<Link className="button-link" href="/">Back to workspace</Link></div>
      </div>
      <section className="fleet-list-panel" aria-labelledby="driver-list-title">
        <div className="fleet-list-heading">
          <div><h2 id="driver-list-title">Drivers</h2><p className="muted">Showing up to 50 active records per page.</p></div>
          <form className="fleet-search" method="get"><label htmlFor="driver-search">Search drivers</label><div><input id="driver-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Name, licence class, qualification"/><button className="button-link" type="submit">Search</button></div></form>
        </div>
        {result.drivers.length === 0 ? <div className="fleet-empty"><h3>No drivers found</h3><p>{params.q ? 'Try a different search, or clear the search term.' : 'No driver records have been entered yet.'}</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Driver records" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Driver register records</caption><thead><tr><th scope="col">Name</th><th scope="col">Licence</th><th scope="col">Qualifications</th><th scope="col">Availability</th><th scope="col">Status</th>{result.canManage && <th scope="col">Record</th>}</tr></thead>
            <tbody>{result.drivers.map((driver) => <tr key={driver.id}>
              <td><strong>{driver.fullName}</strong>{driver.licenceExpiresAt && <span className="vehicle-secondary">Licence expires: {driver.licenceExpiresAt}</span>}</td>
              <td>{driver.licenceClass ?? 'Not recorded'}</td><td>{driver.qualifications ?? 'Not recorded'}</td>
              <td>{driver.availability ?? 'Not recorded'}</td><td>{driver.status ?? 'Not recorded'}</td>
              {result.canManage && <td><Link className="button-link vehicle-edit-link" href={`/fleet/drivers?edit=${encodeURIComponent(driver.id)}${params.q ? `&q=${encodeURIComponent(params.q)}` : ''}`}>Edit</Link></td>}
            </tr>)}</tbody>
          </table>
        </div>}
        {result.nextCursor && <div className="fleet-pagination"><span className="muted">More records available.</span><Link className="button-link" href={`/fleet/drivers?${params.q ? `q=${encodeURIComponent(params.q)}&` : ''}cursor=${encodeURIComponent(result.nextCursor)}`}>Next page</Link></div>}
      </section>
      {result.canManage && <DriverManager companyId={company.id} driver={editing} />}
      {!result.canManage && <p className="form-help">Your role can view the limited operational driver fields above, but cannot view contact details or edit driver records.</p>}
      <p className="fleet-limits">Status/availability vocabulary, driver-to-account linking, assigned-vehicle view, and driver workflows are not configured yet.</p>
    </div>
  </main>;
}
