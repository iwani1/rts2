import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  listVehicleLocationHistory,
  listVehicleLocations,
  LOCATION_RETENTION_DAYS,
} from '@/modules/locations/gps';
import { PurgeLocationsButton } from './purge-button';

export const dynamic = 'force-dynamic';

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra',
  }).format(value);
}

const FRESHNESS_LABEL: Record<string, string> = {
  LIVE: 'Live',
  STALE: 'Stale',
  SIMULATED: 'Simulated',
  NONE: 'No reports',
};

/** GPS-01 (D-077): last reported vehicle positions, honestly labelled. */
export default async function VehicleLocationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const params = await searchParams;
  const selectedVehicleId = typeof params.vehicle === 'string' ? params.vehicle : null;
  const prisma = getPrisma();
  const companies = await prisma.company.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
    take: 2,
  });
  if (companies.length !== 1) {
    return <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <p className="text-sm text-red-700">Expected exactly one active company before opening vehicle locations.</p>
    </main>;
  }
  const company = companies[0];

  let result: Awaited<ReturnType<typeof listVehicleLocations>> | null = null;
  let denied = false;
  try {
    result = await listVehicleLocations({ actorId: session.user.id, companyId: company.id });
  } catch (error) {
    if (error instanceof PermissionDeniedError) denied = true;
    else throw error;
  }

  const history = !denied && result && selectedVehicleId
    ? await listVehicleLocationHistory({
      actorId: session.user.id, companyId: company.id, vehicleId: selectedVehicleId,
    }).catch(() => [])
    : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">Vehicle locations</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Positions are reported by vehicle devices or driver phones <strong>only while a vehicle is on an
          active trip</strong>. History is kept for {LOCATION_RETENTION_DAYS} days and is restricted to
          fleet and dispatch managers. Drivers are told about this tracking in their driver view.
        </p>
        <p className="mt-2 text-sm"><Link className="font-medium text-slate-900 underline" href="/">← Back to Richie TMS</Link></p>
      </header>

      {denied || !result ? (
        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm text-amber-900">Vehicle locations are restricted to fleet and dispatch managers. Your login does not include that access.</p>
        </section>
      ) : !result.configuration.configured ? (
        <section className="mt-6 rounded-lg border border-slate-300 bg-slate-50 p-5">
          <h2 className="text-base font-semibold text-slate-950">Not configured</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            GPS tracking is not configured for this company yet, so no positions are shown — and none are
            invented. To turn it on, set <code>GPS_PROVIDER=generic</code> and a
            {' '}<code>GPS_WEBHOOK_SECRET</code> (at least 16 characters), then have devices post reports to
            {' '}<code>/api/locations/webhook</code> with the <code>x-webhook-secret</code> header.
          </p>
        </section>
      ) : (
        <>
          <div className="mt-6">
            <PurgeLocationsButton companyId={company.id} />
          </div>
          <section className="mt-4 grid gap-3">
            {result.vehicles.map((vehicle) => (
              <article className="rounded-lg border border-slate-200 bg-white p-4" key={vehicle.vehicleId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-950">{vehicle.registrationNumber}</h3>
                  <span className="status-pill">{FRESHNESS_LABEL[vehicle.freshness] ?? vehicle.freshness}</span>
                </div>
                {vehicle.recordedAt ? (
                  <p className="mt-1 text-sm text-slate-600">
                    {vehicle.latitude?.toFixed(5)}, {vehicle.longitude?.toFixed(5)} ·{' '}
                    {formatWhen(vehicle.recordedAt)} (Africa/Accra)
                    {vehicle.tripReference ? ` · Trip ${vehicle.tripReference}` : ''}
                    {vehicle.source ? ` · via ${vehicle.source.replaceAll('_', ' ').toLowerCase()}` : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">No position reported yet.</p>
                )}
                <Link
                  className="mt-2 inline-block font-medium text-slate-900 underline"
                  href={`/fleet/locations?vehicle=${vehicle.vehicleId}`}
                >
                  View history
                </Link>
              </article>
            ))}
          </section>

          {selectedVehicleId ? (
            <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-950">Position history (latest 200)</h2>
              {history.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No reports for this vehicle yet.</p>
              ) : (
                <ul className="mt-3 grid gap-2 text-sm text-slate-700">
                  {history.map((row) => (
                    <li className="rounded-md bg-slate-50 px-3 py-2" key={row.reportId}>
                      {row.latitude.toFixed(5)}, {row.longitude.toFixed(5)} · {formatWhen(row.recordedAt)}
                      {row.tripReference ? ` · Trip ${row.tripReference}` : ''}
                      {' '}· {row.source.replaceAll('_', ' ').toLowerCase()}
                      {row.accuracyMeters !== null ? ` · ±${row.accuracyMeters} m` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
