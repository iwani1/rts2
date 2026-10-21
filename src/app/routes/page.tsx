import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { listClients } from '@/modules/clients/clients';
import {
  RouteCompanyNotFoundError,
} from '@/modules/routes/route-access';
import { LocationNotFoundError, getLocation, listLocations } from '@/modules/routes/locations';
import type { LocationRecord } from '@/modules/routes/locations';
import { RouteNotFoundError, getRoute, getRoutePlan, listRoutes } from '@/modules/routes/routes';
import type { RouteRecord } from '@/modules/routes/routes';
import { listRouteSchedules } from '@/modules/routes/route-schedules';
import type { RouteScheduleRecord } from '@/modules/routes/route-schedules';
import type { RoutePlan } from '@/modules/routes/route-plan';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { LocationManager } from './location-manager';
import { RouteManager } from './route-manager';

export const dynamic = 'force-dynamic';
type PageProps = { searchParams: Promise<{ q?: string; location?: string; route?: string }> };

export default async function RoutesPage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Routes unavailable</h1><p>Exactly one active operator company must be provisioned for this installation.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;
  const company = companies[0];
  const params = await searchParams;

  let locations: LocationRecord[] = [];
  let routes: RouteRecord[] = [];
  let clientOptions: Array<{ id: string; name: string }> = [];
  let canManage = false;
  try {
    const locationResult = await listLocations({ actorId: session.user.id, companyId: company.id, search: params.q });
    locations = locationResult.locations;
    canManage = locationResult.canManage;
    const routeResult = await listRoutes({ actorId: session.user.id, companyId: company.id });
    routes = routeResult.routes;
    const clients = await listClients({ actorId: session.user.id, companyId: company.id });
    clientOptions = clients.clients.map((client) => ({ id: client.id, name: client.name }));
  } catch (error) {
    if (error instanceof RouteCompanyNotFoundError) notFound();
    if (error instanceof ZodError) redirect('/routes');
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }

  let editingLocation: LocationRecord | undefined;
  if (params.location) {
    try {
      editingLocation = (await getLocation({ actorId: session.user.id, companyId: company.id, locationId: params.location })).location;
    } catch (error) {
      if (error instanceof LocationNotFoundError) notFound();
      if (error instanceof PermissionDeniedError) redirect('/routes');
      throw error;
    }
  }

  let editingRoute: RouteRecord | undefined;
  let schedules: RouteScheduleRecord[] = [];
  let plan: RoutePlan | undefined;
  if (params.route) {
    try {
      editingRoute = (await getRoute({ actorId: session.user.id, companyId: company.id, routeId: params.route })).route;
      schedules = (await listRouteSchedules({ actorId: session.user.id, companyId: company.id, routeId: params.route })).schedules;
      plan = (await getRoutePlan({ actorId: session.user.id, companyId: company.id, routeId: params.route })).plan;
    } catch (error) {
      if (error instanceof RouteNotFoundError) notFound();
      if (error instanceof PermissionDeniedError) redirect('/routes');
      throw error;
    }
  }

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Routes navigation">
        <Link href="/">Workspace</Link>
        <Link href="/clients">Corporate clients</Link>
        <Link href="/employees">Employees</Link>
        <span aria-current="page">Routes and schedules</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Routes and schedules</h1><p className="muted">Locations, ordered stops and schedules for staff transport. No map provider is configured: planning figures are manual and labelled approximate, never “optimal”.</p></div>
        <div className="client-actions"><Link className="button-link" href="/">Back to workspace</Link></div>
      </div>

      <section className="fleet-list-panel" aria-labelledby="location-list-title">
        <div className="fleet-list-heading">
          <div><h2 id="location-list-title">Locations and stops</h2><p className="muted">Coordinates are optional; a landmark description keeps unmapped places usable.</p></div>
          <form className="fleet-search" method="get"><label htmlFor="location-search">Search locations</label><div><input id="location-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Name, landmark or digital address"/><button className="button-link" type="submit">Search</button></div></form>
        </div>
        {locations.length === 0 ? <div className="fleet-empty"><h3>No locations found</h3><p>{params.q ? <>Try a different search. <Link className="button-link" href="/routes">Clear search</Link></> : 'No locations have been entered yet.'}</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Location records" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Location records</caption><thead><tr><th scope="col">Location</th><th scope="col">Landmark</th><th scope="col">Coordinates</th><th scope="col">Record</th></tr></thead>
            <tbody>{locations.map((location) => <tr key={location.id}>
              <td><strong>{location.name}</strong>{location.ghanaDigitalAddress && <span className="vehicle-secondary">{location.ghanaDigitalAddress}</span>}</td>
              <td>{location.landmarkDescription ?? 'Not recorded'}</td>
              <td>{location.latitude && location.longitude ? `${location.latitude}, ${location.longitude}` : 'Not mapped'}</td>
              <td><Link className="button-link vehicle-edit-link" href={`/routes?location=${encodeURIComponent(location.id)}`}>Edit</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      {canManage && <LocationManager companyId={company.id} location={editingLocation} />}

      <section className="fleet-list-panel" aria-labelledby="route-list-title">
        <div className="fleet-list-heading">
          <div><h2 id="route-list-title">Routes</h2><p className="muted">Select a route to edit its details, approved stop order, schedules and manual plan.</p></div>
        </div>
        {routes.length === 0 ? <div className="fleet-empty"><h3>No routes found</h3><p>No routes have been entered yet.</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Route records" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Route records</caption><thead><tr><th scope="col">Reference</th><th scope="col">Route</th><th scope="col">Client</th><th scope="col">From → To</th><th scope="col">Stops</th><th scope="col">Status</th><th scope="col">Record</th></tr></thead>
            <tbody>{routes.map((route) => <tr key={route.id}>
              <td><strong>{route.reference}</strong></td>
              <td>{route.name}<span className="vehicle-secondary">{route.serviceType ?? 'Service type not recorded'}</span></td>
              <td>{route.clientName}</td>
              <td>{route.originName} → {route.destinationName}</td>
              <td>{route.stops.length}</td>
              <td>{route.active ? 'Active' : 'Inactive'}</td>
              <td><Link className="button-link vehicle-edit-link" href={`/routes?route=${encodeURIComponent(route.id)}`}>Open</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
      {canManage && <RouteManager companyId={company.id} clients={clientOptions} locations={locations} route={editingRoute} schedules={schedules} plan={plan} />}
      <p className="fleet-limits">Trips are generated from schedules in the trips slice (TRP-01); until then schedules record the approved operating pattern only. One-time schedule dates use the Africa/Accra calendar day.</p>
    </div>
  </main>;
}
