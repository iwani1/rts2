import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { FleetCompanyNotFoundError, getVehicle, InvalidVehicleCursorError, listVehicles, VehicleNotFoundError } from '@/modules/fleet/vehicles';
import type { VehicleRecord } from '@/modules/fleet/vehicles';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { formatAccraDateTime } from '@/modules/time/accra-date-time';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { VehicleManager } from './vehicle-manager';
import { SafetyBlockControls } from './safety-block-controls';

export const dynamic = 'force-dynamic';
type PageProps = { searchParams: Promise<{ q?: string; cursor?: string; cursorHistory?: string; edit?: string }> };
function vehiclePageHref({ search, cursor, history, edit }: { search?: string; cursor?: string; history?: string[]; edit?: string }) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (cursor) params.set('cursor', cursor);
  if (history?.length) params.set('cursorHistory', history.join('.'));
  if (edit) params.set('edit', edit);
  const query = params.toString();
  return `/fleet/vehicles${query ? `?${query}` : ''}`;
}

export default async function VehiclesPage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Vehicle register unavailable</h1><p>Exactly one active operator company must be provisioned for this installation. No vehicle data was loaded.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;

  const params = await searchParams;
  const cursorHistory = params.cursorHistory ? params.cursorHistory.split('.') : [];
  if (cursorHistory.length > 50 || cursorHistory.some((token) => token !== 'ROOT' && !/^[A-Za-z0-9_-]{1,128}$/.test(token))) {
    redirect('/fleet/vehicles');
  }
  let result: Awaited<ReturnType<typeof listVehicles>>;
  try {
    result = await listVehicles({ actorId: session.user.id, companyId: companies[0].id, search: params.q, cursor: params.cursor });
  } catch (error) {
    if (error instanceof FleetCompanyNotFoundError) notFound();
    if (error instanceof InvalidVehicleCursorError || error instanceof ZodError) redirect('/fleet/vehicles');
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }
  let editing: VehicleRecord | undefined;
  if (params.edit) {
    if (!result.canManage) redirect('/fleet/vehicles');
    try {
      const detail = await getVehicle({ actorId: session.user.id, companyId: companies[0].id, vehicleId: params.edit });
      editing = detail.vehicle;
    } catch (error) {
      if (error instanceof VehicleNotFoundError) notFound();
      if (error instanceof PermissionDeniedError) redirect('/fleet/vehicles');
      throw error;
    }
  }
  const previousToken = cursorHistory[cursorHistory.length - 1];
  const previousHref = vehiclePageHref({ search: params.q, cursor: previousToken && previousToken !== 'ROOT' ? previousToken : undefined, history: cursorHistory.slice(0, -1) });
  const nextHistory = params.cursor ? [...cursorHistory.slice(-49), params.cursor] : ['ROOT'];

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Fleet navigation"><Link href="/">Workspace</Link>{result.canManageDrivers && <Link href="/fleet/drivers">Driver register</Link>}<span aria-current="page">Vehicle register</span></nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{companies[0].name}</p><h1>Vehicle register</h1><p className="muted">Verified fleet records, stored without assumed vehicle categories or policy defaults.</p></div>
        <div className="fleet-title-actions">{result.canManage && <><Link className="button-link" href="/fleet/dashboard">Fleet overview</Link><Link className="button-link" href="/fleet/vehicles/documents">Document dates</Link><Link className="button-primary" href="/fleet/vehicles/import">Import vehicles</Link></>}<Link className="button-link" href="/">Back to workspace</Link></div>
      </div>
      <section className="fleet-list-panel" aria-labelledby="vehicle-list-title">
        <div className="fleet-list-heading"><div><h2 id="vehicle-list-title">Vehicles</h2><p className="muted">Showing up to 50 active records per page.</p></div>
          <form className="fleet-search" method="get"><label htmlFor="vehicle-search">Search vehicles</label><div><input id="vehicle-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Registration, make, model, category"/><button className="button-link" type="submit">Search</button></div></form>
        </div>
        {result.vehicles.length === 0 ? <div className="fleet-empty"><h3>No vehicles found</h3><p>{params.q ? <>Try a different search, or clear the search term. <Link className="button-link" href="/fleet/vehicles">Clear search</Link></> : 'No vehicle records have been entered yet.'}</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Vehicle records" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Vehicle register records</caption><thead><tr><th scope="col">Registration</th><th scope="col">Vehicle</th><th scope="col">Category</th><th scope="col">Seats</th><th scope="col">Safety block</th>{result.canManageDrivers && <th scope="col">Usual driver</th>}{result.canManage && <><th scope="col">Odometer</th><th scope="col">Document dates</th><th scope="col">Record</th></>}</tr></thead>
            <tbody>{result.vehicles.map((vehicle) => <tr key={vehicle.id}><td><strong>{vehicle.registrationNumber}</strong></td><td>{vehicle.make} {vehicle.model}{vehicle.fuelType && <span className="vehicle-secondary">{vehicle.fuelType}</span>}</td><td>{vehicle.category}</td><td>{vehicle.seatCount ?? '—'}</td><td>{vehicle.safetyBlock ? <><strong>Blocked — {vehicle.safetyBlock.status}</strong><span className="vehicle-secondary">Applied {formatAccraDateTime(vehicle.safetyBlock.appliedAt)}</span>{vehicle.safetyBlock.reason && <span className="vehicle-secondary">Reason: {vehicle.safetyBlock.reason}</span>}</> : 'No active safety block recorded'}{result.canManage && <SafetyBlockControls companyId={companies[0].id} vehicleId={vehicle.id} activeBlock={vehicle.safetyBlock} />}</td>{result.canManageDrivers && <td>{vehicle.usualDriverName ? <>{vehicle.usualDriverName}{vehicle.usualDriverArchived && <span className="vehicle-secondary">Archived driver record</span>}</> : 'Not recorded'}</td>}{result.canManage && <><td>{vehicle.odometerValue === null ? '—' : `${vehicle.odometerValue} ${vehicle.odometerUnit === 'KM' ? 'km' : 'mi'}`}</td><td><span className="vehicle-secondary">Insurance: {vehicle.insuranceExpiresAt ?? 'not recorded'}</span><span className="vehicle-secondary">Roadworthiness: {vehicle.roadworthinessExpiresAt ?? 'not recorded'}</span><span className="vehicle-secondary">Registration: {vehicle.registrationExpiresAt ?? 'not recorded'}</span><span className="vehicle-secondary">Service: {vehicle.nextServiceAt ?? 'not recorded'}</span></td><td><Link className="button-link vehicle-edit-link" href={vehiclePageHref({ search: params.q, cursor: params.cursor, history: cursorHistory, edit: vehicle.id })}>Edit</Link></td></>}</tr>)}</tbody>
          </table>
        </div>}
        {(params.cursor || result.nextCursor) && <nav className="fleet-pagination" aria-label="Vehicle pages">
          {params.cursor && <Link className="button-link" href={previousHref}>Previous page</Link>}
          <span className="muted">Showing up to 50 vehicles per page.</span>
          {result.nextCursor && <Link className="button-link" href={vehiclePageHref({ search: params.q, cursor: result.nextCursor, history: nextHistory })}>Next page</Link>}
        </nav>}
      </section>
      {result.canManage && <VehicleManager key={editing?.id ?? 'new'} companyId={companies[0].id} vehicle={editing} canAssignUsualDriver={result.canManageDrivers} />}
      {!result.canManage && <p className="form-help">Your current fleet permission allows this limited register view. Editing and restricted fleet details are not available to your role.</p>}
      <p className="fleet-limits">Active safety blocks are shown and can be released only after recorded work completion and a passed inspection. Reservation-derived statuses, assignment prevention, document uploads and reminders are not available yet.</p>
    </div>
  </main>;
}
