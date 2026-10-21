import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { getTransportReport, TRANSPORT_SCOPES, type TransportReport } from '@/modules/reports/transport-reports';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

function percent(value: number | null) {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

export default async function TransportReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const params = await searchParams;
  const prisma = getPrisma();
  const companies = await prisma.company.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
    take: 2,
  });
  if (companies.length !== 1) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Expected exactly one active company before opening reports.</p>
      </main>
    );
  }
  const company = companies[0];
  const permission = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'report:export' });
  const canView = permission.allowed
    && permission.scopes.some((scope) => (TRANSPORT_SCOPES as readonly string[]).includes(scope));
  if (!canView) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Transport report access is not permitted for the signed-in user.</p>
        <p className="mt-2 text-sm text-slate-600"><Link className="font-medium text-slate-900 underline" href="/reports">Back to reports</Link></p>
      </main>
    );
  }

  const filters = {
    fromDate: firstParam(params.fromDate) || undefined,
    toDate: firstParam(params.toDate) || undefined,
    clientId: firstParam(params.clientId) || undefined,
    routeId: firstParam(params.routeId) || undefined,
    driverId: firstParam(params.driverId) || undefined,
    vehicleId: firstParam(params.vehicleId) || undefined,
    serviceType: firstParam(params.serviceType) || undefined,
    status: firstParam(params.status) || undefined,
  };
  let report: TransportReport | null = null;
  let loadError: string | null = null;
  try {
    report = await getTransportReport({ actorId: session.user.id, companyId: company.id, ...filters });
  } catch (error) {
    if (error instanceof ZodError) loadError = 'The selected filters are invalid. Use an end date on or after the start date, spanning at most 366 days.';
    else if (error instanceof PermissionDeniedError) loadError = 'Transport report access is not permitted for the signed-in user.';
    else throw error;
  }

  const [clients, routes, drivers, vehicles] = await Promise.all([
    prisma.client.findMany({ where: { companyId: company.id, archivedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true }, take: 200 }),
    prisma.route.findMany({ where: { companyId: company.id, archivedAt: null }, orderBy: { reference: 'asc' }, select: { id: true, reference: true, name: true }, take: 200 }),
    prisma.driver.findMany({ where: { companyId: company.id, archivedAt: null }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true }, take: 200 }),
    prisma.vehicle.findMany({ where: { companyId: company.id, archivedAt: null }, orderBy: { registrationNumber: 'asc' }, select: { id: true, registrationNumber: true }, take: 200 }),
  ]);
  const exportQuery = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value).map(([key, value]) => [key, value as string]),
  ).toString();

  const selectClass = 'rounded-md border border-slate-300 px-3 py-2';
  const labelClass = 'text-sm text-slate-700';
  const labelText = 'mb-1 block font-medium text-slate-500';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Staff transport &amp; fleet report</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Booking flow is counted from status-history events in the window; pickup delay compares
            boarding times with planned trip starts; utilisation counts only Completed trips with
            both a capacity and a manifest. Anything the records cannot support is labelled
            insufficient-data.
          </p>
        </div>
        <div className="flex gap-2">
          {report ? (
            <a className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={`/api/companies/${company.id}/reports/transport/export${exportQuery ? `?${exportQuery}` : ''}`}>
              Export CSV
            </a>
          ) : null}
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/reports">Reports</Link>
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/">Back to home</Link>
        </div>
      </header>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className={labelClass}><span className={labelText}>From</span>
          <input className={selectClass} defaultValue={filters.fromDate ?? ''} name="fromDate" type="date" /></label>
        <label className={labelClass}><span className={labelText}>To</span>
          <input className={selectClass} defaultValue={filters.toDate ?? ''} name="toDate" type="date" /></label>
        <label className={labelClass}><span className={labelText}>Client</span>
          <select className={selectClass} defaultValue={filters.clientId ?? ''} name="clientId">
            <option value="">All clients</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select></label>
        <label className={labelClass}><span className={labelText}>Route</span>
          <select className={selectClass} defaultValue={filters.routeId ?? ''} name="routeId">
            <option value="">All routes</option>
            {routes.map((route) => <option key={route.id} value={route.id}>{route.reference} — {route.name}</option>)}
          </select></label>
        <label className={labelClass}><span className={labelText}>Driver</span>
          <select className={selectClass} defaultValue={filters.driverId ?? ''} name="driverId">
            <option value="">All drivers</option>
            {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}
          </select></label>
        <label className={labelClass}><span className={labelText}>Vehicle</span>
          <select className={selectClass} defaultValue={filters.vehicleId ?? ''} name="vehicleId">
            <option value="">All vehicles</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registrationNumber}</option>)}
          </select></label>
        <label className={labelClass}><span className={labelText}>Trip status</span>
          <select className={selectClass} defaultValue={filters.status ?? ''} name="status">
            <option value="">Any status</option>
            {['Planned', 'Ready for Dispatch', 'Dispatched', 'In Progress', 'Delayed', 'Completed', 'Cancelled', 'Interrupted'].map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select></label>
        <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Apply filters</button>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/reports/transport">Clear</Link>
      </form>

      {loadError ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{loadError}</p>
      ) : null}

      {report ? (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Booking flow">
            {[
              ['Bookings received', report.bookings.received],
              ['Confirmed', report.bookings.confirmed],
              ['Passengers transported', report.bookings.passengersTransported],
              ['No-shows', report.bookings.noShows],
            ].map(([label, value]) => (
              <div className="rounded-lg border border-slate-200 bg-white p-5" key={label}>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Booking flow detail</h2>
              <table className="w-full text-left text-sm">
                <tbody>
                  {[
                    ['Received (→ Pending)', report.bookings.received],
                    ['Confirmed (→ Accepted)', report.bookings.confirmed],
                    ['Boarded (→ Boarded)', report.bookings.boarded],
                    ['Completed (→ Completed)', report.bookings.completed],
                    ['Cancelled (→ Cancelled)', report.bookings.cancelled],
                    ['Rejected (→ Rejected)', report.bookings.rejected],
                    ['of which passenger no-shows', report.bookings.noShows],
                  ].map(([label, value]) => (
                    <tr className="border-t border-slate-100" key={label}>
                      <td className="px-4 py-2 text-slate-700">{label}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Pickup punctuality</h2>
              <dl className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex justify-between"><dt>Boarded pickups in window</dt><dd>{report.pickups.eligibleBoardedPickups}</dd></div>
                <div className="flex justify-between"><dt>With planned + actual times</dt><dd>{report.pickups.pickupsWithPlannedAndActual}</dd></div>
                <div className="flex justify-between"><dt>Late pickups</dt><dd>{report.pickups.latePickups}</dd></div>
                <div className="flex justify-between"><dt>Average delay (all samples)</dt><dd>{report.pickups.averageDelayAllMinutes === null ? '—' : `${report.pickups.averageDelayAllMinutes} min`}</dd></div>
                <div className="flex justify-between"><dt>Average delay (late only)</dt><dd>{report.pickups.averageDelayLateOnlyMinutes === null ? '—' : `${report.pickups.averageDelayLateOnlyMinutes} min`}</dd></div>
                <div className="flex justify-between"><dt>On-time pickup rate</dt><dd>Insufficient data</dd></div>
              </dl>
              <p className="mt-3 text-xs text-slate-500">{report.pickups.onTimeReason}</p>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                Route utilisation — {percent(report.routeUtilisation.utilisation)} overall
              </h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Route</th><th className="px-4 py-2 font-medium">Trips</th><th className="px-4 py-2 font-medium">Passengers</th><th className="px-4 py-2 font-medium">Capacity</th><th className="px-4 py-2 font-medium">Utilisation</th></tr>
                </thead>
                <tbody>
                  {report.routeUtilisation.routes.map((row) => (
                    <tr className="border-t border-slate-100" key={row.routeId ?? 'none'}>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.routeLabel}</td>
                      <td className="px-4 py-2 text-slate-700">{row.trips}</td>
                      <td className="px-4 py-2 text-slate-700">{row.occupiedSeats}</td>
                      <td className="px-4 py-2 text-slate-700">{row.capacitySeats}</td>
                      <td className="px-4 py-2 text-slate-700">{percent(row.utilisation)}</td>
                    </tr>
                  ))}
                  {report.routeUtilisation.routes.length === 0 ? (
                    <tr><td className="px-4 py-4 text-slate-600" colSpan={5}>No completed trips with capacity and a manifest in scope.</td></tr>
                  ) : null}
                </tbody>
              </table>
              <p className="px-4 py-3 text-xs text-slate-500">
                {report.routeUtilisation.excludedCompletedTrips} completed trip(s) excluded for missing capacity or manifest.
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Trips by status</h2>
              <table className="w-full text-left text-sm">
                <tbody>
                  {report.trips.byStatus.map((row) => (
                    <tr className="border-t border-slate-100" key={row.status}>
                      <td className="px-4 py-2 text-slate-700">{row.status}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.count}</td>
                    </tr>
                  ))}
                  {report.trips.byStatus.length === 0 ? (
                    <tr><td className="px-4 py-4 text-slate-600" colSpan={2}>No trips in scope.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Fleet ({report.fleet.totalVehicles} vehicles)</h2>
              <table className="w-full text-left text-sm">
                <tbody>
                  {report.fleet.byCategory.map((row) => (
                    <tr className="border-t border-slate-100" key={row.category}>
                      <td className="px-4 py-2 text-slate-700">{row.category}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.count}</td>
                    </tr>
                  ))}
                  {report.fleet.activeSafetyBlocks.map((row) => (
                    <tr className="border-t border-slate-100" key={row.status}>
                      <td className="px-4 py-2 text-slate-700">Safety blocked: {row.status}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.count}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-700">Archived</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{report.fleet.archivedVehicles}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Document expiry (as of {report.documentExpiry.asOf})</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Document</th><th className="px-4 py-2 font-medium">Expiring in window</th><th className="px-4 py-2 font-medium">Already expired</th></tr>
                </thead>
                <tbody>
                  {report.documentExpiry.documents.map((row) => (
                    <tr className="border-t border-slate-100" key={row.document}>
                      <td className="px-4 py-2 text-slate-700">{row.document}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.expiringInWindow ?? '—'}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.alreadyExpired}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Maintenance</h2>
              <table className="w-full text-left text-sm">
                <tbody>
                  {report.maintenance.byStatus.map((row) => (
                    <tr className="border-t border-slate-100" key={row.status}>
                      <td className="px-4 py-2 text-slate-700">{row.status}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.count}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-700">Recorded costs ({report.maintenance.withAnyCostData} of {report.maintenance.workOrdersInScope} orders have cost data)</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{cedis(report.maintenance.recordedCostPesewas)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-sm font-semibold text-amber-900">Not shown — insufficient data</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {report.unavailableMetrics.map((item) => (
                  <li key={item.metric}><span className="font-medium">{item.metric}:</span> {item.reason}</li>
                ))}
              </ul>
            </div>
          </section>
          <p className="mt-4 text-xs text-slate-500">Generated {new Date(report.generatedAt).toISOString()}.</p>
        </>
      ) : null}
    </main>
  );
}
