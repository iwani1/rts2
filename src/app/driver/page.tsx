import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import {
  DriverNotLinkedError,
  getDriverTrip,
  listDriverTrips,
} from '@/modules/driver/driver';
import { DriverActions } from './driver-actions';
import { DriverIncidentReportForm } from './incident-report-form';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DriverPage({
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
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8">
        <p className="text-sm text-red-700">Expected exactly one active company before opening the driver view.</p>
      </main>
    );
  }
  const company = companies[0];
  const date = firstParam(params.date) ?? new Date().toISOString().slice(0, 10);
  const selectedId = firstParam(params.trip);

  let driverName = '';
  let trips: Awaited<ReturnType<typeof listDriverTrips>>['trips'] = [];
  let detail: Awaited<ReturnType<typeof getDriverTrip>> | null = null;
  let notice: string | null = null;
  try {
    const result = await listDriverTrips({ actorId: session.user.id, companyId: company.id, date });
    driverName = result.driverName;
    trips = result.trips;
    const selected = trips.find((trip) => trip.id === selectedId) ?? trips[0] ?? null;
    if (selected) {
      detail = await getDriverTrip({ actorId: session.user.id, companyId: company.id, tripId: selected.id });
    }
  } catch (error) {
    if (error instanceof DriverNotLinkedError) {
      notice = error.message;
    } else {
      throw error;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">My trips{driverName ? ` — ${driverName}` : ''}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Only trips assigned to you are shown. Events are sent with a one-time key, so retrying after a network
          problem never applies an event twice.
        </p>
      </header>

      {notice ? (
        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm text-amber-900">{notice}</p>
        </section>
      ) : (
        <>
          <form className="mt-6 flex items-end gap-3" method="get">
            <label className="grid gap-1 text-sm text-slate-700">
              Date
              <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={date} name="date" type="date" />
            </label>
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">
              Load
            </button>
          </form>

          <section className="mt-6 grid gap-3">
            {trips.map((trip) => (
              <article className="rounded-lg border border-slate-200 bg-white p-4" key={trip.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-950">{trip.reference} — {trip.status}</h2>
                  <span className="text-sm text-slate-500">{trip.tripDate}{trip.plannedStartTime ? ` ${trip.plannedStartTime}` : ''}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {trip.routeName ?? 'Ad hoc trip'} · {trip.passengerCount} passenger(s)
                  {trip.pickupNames.length ? ` · Pickups: ${trip.pickupNames.join(', ')}` : ''}
                </p>
                <Link
                  className="mt-2 inline-block font-medium text-slate-900 underline"
                  href={`/driver?${new URLSearchParams({ date, trip: trip.id }).toString()}`}
                >
                  Open trip
                </Link>
              </article>
            ))}
            {trips.length === 0 ? (
              <p className="text-sm text-slate-600">No trips assigned to you on this date.</p>
            ) : null}
          </section>

          {detail ? (
            <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-950">Trip {detail.reference}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Vehicle: {detail.vehicleRegistration ?? 'not shown'} · Status: {detail.status} ·{' '}
                {detail.passengerCount} passenger(s)
              </p>
              {detail.manifest.length ? (
                <ul className="mt-3 grid gap-2 text-sm text-slate-700">
                  {detail.manifest.map((entry) => (
                    <li className="rounded-md bg-slate-50 px-3 py-2" key={entry.bookingId}>
                      {entry.employeeName} — {entry.pickupName ?? 'pickup not set'} → {entry.dropoffName ?? 'drop-off not set'} ({entry.status})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-600">No passengers on the manifest.</p>
              )}
              <DriverActions
                companyId={company.id}
                manifest={detail.manifest}
                returnTo={`/driver?${new URLSearchParams({ date, trip: detail.id }).toString()}`}
                tripId={detail.id}
                tripStatus={detail.status}
              />
              {detail.events.length ? (
                <p className="mt-4 text-xs text-slate-500">
                  Recent events: {detail.events.map((event) => `${event.eventType} ${event.createdAt.toISOString().slice(11, 16)}`).join(' · ')}
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      {!notice ? (
        <DriverIncidentReportForm
          companyId={company.id}
          trips={trips.map((trip) => ({ id: trip.id, reference: trip.reference, status: trip.status }))}
        />
      ) : null}

      <footer className="mt-8 border-t border-slate-200 pt-4">
        <Link className="text-sm font-medium text-slate-700 underline" href="/">Back to home</Link>
      </footer>
    </main>
  );
}
