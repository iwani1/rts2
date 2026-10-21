import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { listIncidents } from '@/modules/incidents/incidents';
import { INCIDENT_TYPE_LABELS, type IncidentType } from '@/modules/incidents/incident-transitions';
import { ReportIncidentForm } from './incident-actions';

export const dynamic = 'force-dynamic';

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra',
  }).format(value);
}

/** INC-01 (D-071): the incident register for dispatch/operations managers. */
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const params = await searchParams;
  const statusFilter = typeof params.status === 'string' ? params.status : undefined;
  const prisma = getPrisma();
  const companies = await prisma.company.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
    take: 2,
  });
  if (companies.length !== 1) {
    return <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <p className="text-sm text-red-700">Expected exactly one active company before opening incidents.</p>
    </main>;
  }
  const company = companies[0];

  let result: Awaited<ReturnType<typeof listIncidents>> | null = null;
  let denied = false;
  try {
    result = await listIncidents({
      actorId: session.user.id, companyId: company.id, status: statusFilter,
    });
  } catch (error) {
    if (error instanceof PermissionDeniedError) denied = true;
    else throw error;
  }

  const [trips, vehicles, drivers] = denied || !result
    ? [[], [], []]
    : await Promise.all([
      prisma.trip.findMany({
        where: { companyId: company.id },
        orderBy: [{ tripDate: 'desc' }, { id: 'desc' }],
        take: 50,
        select: { id: true, reference: true, status: true },
      }),
      prisma.vehicle.findMany({
        where: { companyId: company.id, archivedAt: null },
        orderBy: { registrationNumber: 'asc' },
        take: 100,
        select: { id: true, registrationNumber: true },
      }),
      prisma.driver.findMany({
        where: { companyId: company.id, archivedAt: null },
        orderBy: { fullName: 'asc' },
        take: 100,
        select: { id: true, fullName: true },
      }),
    ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">Incidents</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Report problems as soon as they happen. Dispatchers are alerted in-app (and by SMS/email
          where those channels are configured). An incident stays open until it is resolved.
        </p>
        <p className="mt-2 text-sm"><Link className="font-medium text-slate-900 underline" href="/">← Back to Richie TMS</Link></p>
      </header>

      {denied || !result ? (
        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm text-amber-900">Incidents are handled by dispatch and operations managers. Your login does not include that access.</p>
        </section>
      ) : (
        <>
          <h2 className="mt-8 text-lg font-semibold text-slate-950">Record an incident</h2>
          <ReportIncidentForm
            companyId={company.id}
            trips={trips.map((trip) => ({ id: trip.id, label: `${trip.reference} — ${trip.status}` }))}
            vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, label: vehicle.registrationNumber }))}
            drivers={drivers.map((driver) => ({ id: driver.id, label: driver.fullName }))}
          />

          <h2 className="mt-10 text-lg font-semibold text-slate-950">
            Incident register {result.totalCount > result.incidents.length
              ? `(showing latest ${result.incidents.length} of ${result.totalCount})`
              : `(${result.totalCount})`}
          </h2>
          <form className="mt-3 flex items-end gap-3" method="get">
            <label className="grid gap-1 text-sm text-slate-700">
              Status
              <select className="rounded-md border border-slate-300 px-3 py-2" name="status" defaultValue={statusFilter ?? ''}>
                <option value="">All statuses</option>
                {['Open', 'Acknowledged', 'In Progress', 'Resolved', 'Closed'].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Filter</button>
          </form>
          <section className="mt-4 grid gap-3">
            {result.incidents.map((incident) => (
              <article className="rounded-lg border border-slate-200 bg-white p-4" key={incident.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-950">
                    {incident.reference} — {INCIDENT_TYPE_LABELS[incident.incidentType as IncidentType] ?? incident.incidentType}
                  </h3>
                  <span className="status-pill">{incident.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Severity {incident.severity.toLowerCase()} · {formatWhen(incident.occurredAt)} (Africa/Accra)
                  {incident.tripReference ? ` · Trip ${incident.tripReference}` : ''}
                  {incident.vehicleRegistration ? ` · Vehicle ${incident.vehicleRegistration}` : ''}
                  {incident.driverName ? ` · Driver ${incident.driverName}` : ''}
                  {incident.locationText ? ` · ${incident.locationText}` : ''}
                </p>
                <p className="mt-1 text-sm text-slate-700">{incident.description}</p>
                <Link className="mt-2 inline-block font-medium text-slate-900 underline" href={`/incidents/${incident.id}`}>
                  Open incident
                </Link>
              </article>
            ))}
            {result.incidents.length === 0 ? (
              <p className="text-sm text-slate-600">No incidents recorded yet.</p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
