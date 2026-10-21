import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getOperationsDashboard, type OperationsDashboard } from '@/modules/operations/dashboard';

export const dynamic = 'force-dynamic';

function QueueTable({ title, total, rows, emptyText }: {
  title: string;
  total: number;
  rows: OperationsDashboard['bookingQueues']['pendingOldest'];
  emptyText: string;
}) {
  return <section className="fleet-list-panel" aria-label={title}>
    <div className="fleet-list-heading"><div>
      <h2>{title}</h2>
      <p className="muted">{total} in total{rows.length < total ? `, showing the first ${rows.length}` : ''}.</p>
    </div></div>
    {rows.length === 0 ? <p className="muted">{emptyText}</p> : (
      <div className="vehicle-table-wrap" role="region" aria-label={title} tabIndex={0}>
        <table className="vehicle-table">
          <thead><tr><th scope="col">Reference</th><th scope="col">Employee</th><th scope="col">Client</th><th scope="col">Journey</th><th scope="col">Type</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.bookingId}>
            <td>{row.reference}</td><td>{row.employeeName}</td><td>{row.clientName}</td>
            <td>{row.journeyDate}</td><td>{row.bookingType.replaceAll('_', ' ')}</td>
          </tr>)}</tbody>
        </table>
      </div>
    )}
  </section>;
}

/** D-067: the Operations Manager dashboard (read-only snapshot). */
export default async function OperationsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const companies = await prisma.company.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
    take: 2,
  });
  if (companies.length !== 1) {
    return <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <p className="text-sm text-red-700">Expected exactly one active company before opening the operations dashboard.</p>
    </main>;
  }
  const company = companies[0];

  let dashboard: OperationsDashboard;
  try {
    dashboard = await getOperationsDashboard({ actorId: session.user.id, companyId: company.id });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return <main className="fleet-page"><div className="fleet-content">
        <h1>Operations dashboard</h1>
        <p className="muted">The operations dashboard is available to Operations Managers and Super Administrators.</p>
        <p><Link className="button-link" href="/">Back to workspace</Link></p>
      </div></main>;
    }
    throw error;
  }
  const documents = dashboard.fleetAlerts.documents;

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Operations navigation">
        <Link href="/">Workspace</Link>
        <Link href="/trips">Trips</Link>
        <Link href="/dispatch">Dispatch</Link>
        <Link href="/bookings">Bookings</Link>
        <span aria-current="page">Operations</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div>
          <p className="eyebrow">{company.name}</p>
          <h1>Operations dashboard</h1>
          <p className="muted">Today is {dashboard.today} (Africa/Accra). A live snapshot of governed records — follow the links to act.</p>
        </div>
        <Link className="button-link" href="/">Back to workspace</Link>
      </div>

      <section className="fleet-list-panel" aria-labelledby="ops-trips-title">
        <div className="fleet-list-heading"><div>
          <h2 id="ops-trips-title">Today&apos;s trips ({dashboard.tripsToday.total})</h2>
          <p className="muted">
            {dashboard.tripsToday.byStatus.length === 0
              ? 'No trips are scheduled for today.'
              : dashboard.tripsToday.byStatus.map((row) => `${row.status}: ${row.count}`).join(' · ')}
            {dashboard.tripsToday.unresourced > 0 && <> · <strong>{dashboard.tripsToday.unresourced} still need a vehicle or driver</strong></>}
          </p>
        </div><Link className="button-link" href="/dispatch">Open dispatch</Link></div>
        {dashboard.tripsToday.list.length > 0 && (
          <div className="vehicle-table-wrap" role="region" aria-label="Today's trips" tabIndex={0}>
            <table className="vehicle-table">
              <thead><tr>
                <th scope="col">Trip</th><th scope="col">Departs</th><th scope="col">Status</th>
                <th scope="col">Client</th><th scope="col">Route</th><th scope="col">Vehicle</th>
                <th scope="col">Driver</th><th scope="col">Bookings assigned</th>
              </tr></thead>
              <tbody>{dashboard.tripsToday.list.map((trip) => <tr key={trip.tripId}>
                <td>{trip.reference}</td>
                <td>{trip.plannedStartTime ?? '—'}</td>
                <td>{trip.status}</td>
                <td>{trip.clientName ?? '—'}</td>
                <td>{trip.routeName ?? '—'}</td>
                <td>{trip.vehicleRegistration ?? (trip.needsVehicle ? 'Needed' : '—')}</td>
                <td>{trip.driverName ?? (trip.needsDriver ? 'Needed' : '—')}</td>
                <td>{trip.assignedBookings}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <QueueTable
        title="Bookings awaiting a decision"
        total={dashboard.bookingQueues.pendingTotal}
        rows={dashboard.bookingQueues.pendingOldest}
        emptyText="No bookings are waiting for a decision."
      />
      <QueueTable
        title="Accepted, not yet assigned to a trip"
        total={dashboard.bookingQueues.acceptedUnassignedTotal}
        rows={dashboard.bookingQueues.acceptedUnassignedNext}
        emptyText="Every accepted booking is assigned to a trip."
      />

      <section className="fleet-list-panel" aria-labelledby="ops-fleet-title">
        <div className="fleet-list-heading"><div>
          <h2 id="ops-fleet-title">Fleet and document alerts</h2>
          <p className="muted">Documents expiring within {documents.windowDays} days, and already expired.</p>
        </div><Link className="button-link" href="/fleet/vehicles">Open fleet</Link></div>
        <dl className="vehicle-specs">
          <div><dt>Vehicles under safety block</dt><dd>{dashboard.fleetAlerts.activeSafetyBlocks}</dd></div>
          <div><dt>Driver licences expiring / expired</dt><dd>{documents.driverLicencesExpiring} / {documents.driverLicencesExpired}</dd></div>
          <div><dt>Vehicle insurance expiring / expired</dt><dd>{documents.vehicleInsuranceExpiring} / {documents.vehicleInsuranceExpired}</dd></div>
          <div><dt>Roadworthiness expiring / expired</dt><dd>{documents.vehicleRoadworthinessExpiring} / {documents.vehicleRoadworthinessExpired}</dd></div>
        </dl>
      </section>
    </div>
  </main>;
}
