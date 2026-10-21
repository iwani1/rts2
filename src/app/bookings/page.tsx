import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import {
  BookingCompanyNotFoundError,
  BookingNotFoundError,
  InvalidBookingCursorError,
  getBooking,
  listBookings,
} from '@/modules/bookings/bookings';
import type { BookingRecord } from '@/modules/bookings/bookings';
import { BOOKING_STATUSES } from '@/modules/bookings/booking-transitions';
import { listClients } from '@/modules/clients/clients';
import { listContracts } from '@/modules/contracts/contracts';
import { listEmployees } from '@/modules/employees/employees';
import { listLocations } from '@/modules/routes/locations';
import { listRoutes } from '@/modules/routes/routes';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { BookingManager } from './booking-manager';

export const dynamic = 'force-dynamic';
const accraDateTime = new Intl.DateTimeFormat('en-GH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Accra',
});
type PageProps = { searchParams: Promise<{ q?: string; status?: string; date?: string; cursor?: string; cursorHistory?: string; edit?: string }> };

export default async function BookingsPage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Bookings unavailable</h1><p>Exactly one active operator company must be provisioned for this installation.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;
  const company = companies[0];
  const params = await searchParams;
  const cursorHistory = params.cursorHistory ? params.cursorHistory.split('.') : [];
  if (cursorHistory.length > 50 || cursorHistory.some((token) => token !== 'ROOT' && !/^[A-Za-z0-9_-]{1,128}$/.test(token))) {
    redirect('/bookings');
  }

  let result: Awaited<ReturnType<typeof listBookings>>;
  let employeeOptions: Array<{ id: string; label: string }> = [];
  let contractOptions: Array<{ id: string; label: string }> = [];
  let routeOptions: Array<{ id: string; label: string }> = [];
  let locationOptions: Array<{ id: string; name: string }> = [];
  try {
    result = await listBookings({
      actorId: session.user.id, companyId: company.id, search: params.q,
      status: params.status, journeyDate: params.date, cursor: params.cursor,
    });
    const employees = await listEmployees({ actorId: session.user.id, companyId: company.id });
    employeeOptions = employees.employees.map((employee) => ({
      id: employee.id, label: `${employee.fullName} — ${employee.clientName}`,
    }));
    const clients = await listClients({ actorId: session.user.id, companyId: company.id });
    const contracts = await listContracts({ actorId: session.user.id, companyId: company.id });
    contractOptions = contracts.contracts.map((contract) => ({
      id: contract.id, label: `${contract.reference} — ${contract.clientName} (${contract.status})`,
    }));
    const clientNames = new Map(clients.clients.map((client) => [client.id, client.name]));
    const routes = await listRoutes({ actorId: session.user.id, companyId: company.id });
    routeOptions = routes.routes.map((route) => ({
      id: route.id, label: `${route.reference} — ${route.name} (${clientNames.get(route.clientId) ?? route.clientName})`,
    }));
    const locations = await listLocations({ actorId: session.user.id, companyId: company.id });
    locationOptions = locations.locations.map((location) => ({ id: location.id, name: location.name }));
  } catch (error) {
    if (error instanceof BookingCompanyNotFoundError) notFound();
    if (error instanceof InvalidBookingCursorError || error instanceof ZodError) redirect('/bookings');
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }

  let editing: BookingRecord | undefined;
  let history: Awaited<ReturnType<typeof getBooking>>['history'] = [];
  if (params.edit) {
    try {
      const detail = await getBooking({ actorId: session.user.id, companyId: company.id, bookingId: params.edit });
      editing = detail.booking;
      history = detail.history;
    } catch (error) {
      if (error instanceof BookingNotFoundError) notFound();
      if (error instanceof PermissionDeniedError) redirect('/bookings');
      throw error;
    }
  }

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Booking navigation">
        <Link href="/">Workspace</Link>
        <Link href="/employees">Employees</Link>
        <Link href="/routes">Routes and schedules</Link>
        <span aria-current="page">Bookings</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Bookings</h1><p className="muted">Employee journey bookings. New bookings are validated for eligibility, contract status, duplicates and journey date before they are accepted.</p></div>
        <div className="client-actions"><Link className="button-link" href="/">Back to workspace</Link></div>
      </div>
      <section className="fleet-list-panel" aria-labelledby="booking-list-title">
        <div className="fleet-list-heading">
          <div><h2 id="booking-list-title">Bookings</h2><p className="muted">Earliest journeys first, up to 50 per page.</p></div>
          <form className="fleet-search" method="get"><label htmlFor="booking-search">Search bookings</label><div><input id="booking-search" type="search" name="q" maxLength={100} defaultValue={params.q ?? ''} placeholder="Reference, employee or client"/><button className="button-link" type="submit">Search</button></div></form>
        </div>
        <form className="fleet-search" method="get" aria-label="Filter bookings">
          <label htmlFor="booking-status-filter">Status</label>
          <div>
            <select id="booking-status-filter" name="status" defaultValue={params.status ?? ''}>
              <option value="">All statuses</option>
              {BOOKING_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <label htmlFor="booking-date-filter">Journey date</label>
            <input id="booking-date-filter" type="date" name="date" defaultValue={params.date ?? ''} />
            <button className="button-link" type="submit">Filter</button>
          </div>
        </form>
        {result.bookings.length === 0 ? <div className="fleet-empty"><h3>No bookings found</h3><p>{params.q || params.status || params.date ? <>Try different filters. <Link className="button-link" href="/bookings">Clear filters</Link></> : 'No bookings have been created yet.'}</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Booking records" tabIndex={0}>
          <table className="vehicle-table"><caption className="sr-only">Booking records</caption><thead><tr><th scope="col">Reference</th><th scope="col">Employee</th><th scope="col">Journey</th><th scope="col">Route</th><th scope="col">Status</th><th scope="col">Record</th></tr></thead>
            <tbody>{result.bookings.map((booking) => <tr key={booking.id}>
              <td><strong>{booking.reference}</strong></td>
              <td>{booking.employeeName}<span className="vehicle-secondary">{booking.clientName}</span></td>
              <td>{booking.journeyDate}<span className="vehicle-secondary">{booking.bookingType.replaceAll('_', ' ')}</span></td>
              <td>{booking.routeName ?? 'Not assigned to a route'}</td>
              <td>{booking.status}</td>
              <td><Link className="button-link vehicle-edit-link" href={`/bookings?edit=${encodeURIComponent(booking.id)}`}>View / act</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {(params.cursor || result.nextCursor) && <nav className="fleet-pagination" aria-label="Booking pages">
          {params.cursor && <Link className="button-link" href="/bookings">First page</Link>}
          <span className="muted">Showing up to 50 bookings per page.</span>
          {result.nextCursor && <Link className="button-link" href={`/bookings?cursor=${encodeURIComponent(result.nextCursor)}`}>Next page</Link>}
        </nav>}
      </section>
      {result.canManage && <BookingManager
        companyId={company.id} employees={employeeOptions} contracts={contractOptions}
        routes={routeOptions} locations={locationOptions} booking={editing}
      />}
      {editing && <section className="fleet-list-panel" aria-labelledby="booking-history-title">
        <div className="fleet-list-heading"><div><h2 id="booking-history-title">Booking history — {editing.reference}</h2><p className="muted">Every status change with its recorded reason.</p></div></div>
        {history.length === 0 ? <p className="fleet-empty">No history recorded.</p> : <ol className="client-history-list">{history.map((event, index) => <li key={`${event.createdAt.toISOString()}-${event.toStatus}-${index}`}><strong>{event.fromStatus ? `${event.fromStatus} → ${event.toStatus}` : event.toStatus}</strong><span>{accraDateTime.format(event.createdAt)} · {event.actorName}</span>{event.reason && <p>{event.reason}</p>}</li>)}</ol>}
      </section>}
      <p className="fleet-limits">Bookings enter at Pending; the Draft stage is reserved for the future passenger portal. Cancellation deadlines and the waiting list arrive with BKG-05; assigning bookings to trips is BKG-04. Booking cut-off times are not configured, so none are enforced.</p>
    </div>
  </main>;
}
