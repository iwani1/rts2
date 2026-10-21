import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, hasRequiredScope } from '@/modules/auth/auth';
import { resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { TRIP_STATUSES } from '@/modules/trips/trip-transitions';
import { getTripManifest, listTrips } from '@/modules/trips/trips';
import { TripsManager } from './trips-manager';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: Date | null) {
  return value ? value.toISOString().replace('T', ' ').slice(0, 16) : 'Not recorded';
}

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
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
        <p className="text-sm text-red-700">Expected exactly one active company before opening trips.</p>
      </main>
    );
  }
  const company = companies[0];
  const permission = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'trip:dispatch' });
  if (!permission.allowed) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Trip access is not permitted for the signed-in user.</p>
      </main>
    );
  }
  const canManage = hasRequiredScope(permission.scopes, 'GLOBAL') || hasRequiredScope(permission.scopes, 'COMPANY');

  const status = firstParam(params.status);
  const validStatus = status && (TRIP_STATUSES as readonly string[]).includes(status) ? status : undefined;
  const date = firstParam(params.date);
  const cursor = firstParam(params.cursor);
  const selectedId = firstParam(params.trip);

  const result = await listTrips({
    actorId: session.user.id,
    companyId: company.id,
    status: validStatus,
    date: date || undefined,
    cursor,
  });
  const selected = result.trips.find((trip) => trip.id === selectedId) ?? result.trips[0] ?? null;
  const manifest = selected
    ? await getTripManifest({ actorId: session.user.id, companyId: company.id, tripId: selected.id })
    : null;
  const [clients, routes, acceptedBookings] = await Promise.all([
    prisma.client.findMany({
      where: { companyId: company.id, archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
      take: 200,
    }),
    prisma.route.findMany({
      where: { companyId: company.id, archivedAt: null, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
      take: 200,
    }),
    selected
      ? prisma.booking.findMany({
        where: {
          companyId: company.id,
          status: 'Accepted',
          journeyDate: new Date(`${selected.tripDate}T00:00:00.000Z`),
          ...(selected.clientId ? { clientId: selected.clientId } : {}),
        },
        orderBy: [{ employee: { fullName: 'asc' } }, { id: 'asc' }],
        select: { id: true, reference: true, employee: { select: { fullName: true } } },
        take: 200,
      })
      : Promise.resolve([]),
  ]);
  const returnTo = `/trips?${new URLSearchParams({
    ...(validStatus ? { status: validStatus } : {}),
    ...(selected ? { trip: selected.id } : {}),
  }).toString()}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Trips and manifests</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Trips are generated from route schedules or created manually, carry an immutable lifecycle with history,
            and hold passenger manifests whose capacity is checked transactionally when bookings are assigned.
          </p>
        </div>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/">
          Back to home
        </Link>
      </header>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm text-slate-700">
          Status
          <select className="rounded-md border border-slate-300 px-3 py-2" defaultValue={validStatus ?? ''} name="status">
            <option value="">Any status</option>
            {TRIP_STATUSES.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-slate-700">
          Trip date
          <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={date ?? ''} name="date" type="date" />
        </label>
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">
          Apply filters
        </button>
      </form>

      <section className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Date / start</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Passengers</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {result.trips.map((trip) => (
              <tr className="border-t border-slate-100" key={trip.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{trip.reference}</td>
                <td className="px-4 py-3 text-slate-700">{trip.tripDate}{trip.plannedStartTime ? ` ${trip.plannedStartTime}` : ''}</td>
                <td className="px-4 py-3 text-slate-700">{trip.routeName ?? 'Not set'}</td>
                <td className="px-4 py-3 text-slate-700">{trip.clientName ?? 'Not set'}</td>
                <td className="px-4 py-3 text-slate-700">{trip.passengerCount}{trip.capacityLimit ? ` of ${trip.capacityLimit}` : ''}</td>
                <td className="px-4 py-3 text-slate-700">{trip.status}</td>
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-slate-900 underline"
                    href={`/trips?${new URLSearchParams({ ...(validStatus ? { status: validStatus } : {}), trip: trip.id }).toString()}`}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {result.trips.length === 0 ? (
              <tr><td className="px-4 py-6 text-slate-600" colSpan={7}>No trips match these filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {selected && manifest ? (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Passenger manifest — {selected.reference}</h2>
          <dl className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-4">
            <div><dt className="font-medium text-slate-500">Passengers</dt><dd>{manifest.passengerCount}</dd></div>
            <div><dt className="font-medium text-slate-500">Capacity</dt><dd>{manifest.capacityNote}</dd></div>
            <div><dt className="font-medium text-slate-500">Actual start</dt><dd>{formatDateTime(selected.actualStartAt)}</dd></div>
            <div><dt className="font-medium text-slate-500">Actual end</dt><dd>{formatDateTime(selected.actualEndAt)}</dd></div>
          </dl>
          {manifest.entries.length > 0 ? (
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr><th className="py-2 pr-4 font-medium">Passenger</th><th className="py-2 pr-4 font-medium">Type</th><th className="py-2 pr-4 font-medium">Pickup</th><th className="py-2 pr-4 font-medium">Drop-off</th><th className="py-2 font-medium">Status</th></tr>
              </thead>
              <tbody>
                {manifest.entries.map((entry) => (
                  <tr className="border-t border-slate-100" key={entry.bookingId}>
                    <td className="py-2 pr-4">{entry.employeeName}</td>
                    <td className="py-2 pr-4">{entry.bookingType}</td>
                    <td className="py-2 pr-4">{entry.pickupName ?? 'Not set'}</td>
                    <td className="py-2 pr-4">{entry.dropoffName ?? 'Not set'}</td>
                    <td className="py-2">{entry.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No passengers are assigned yet.</p>
          )}
        </section>
      ) : null}

      <TripsManager
        acceptedBookings={acceptedBookings.map((booking) => ({ id: booking.id, label: `${booking.employee.fullName} — ${booking.reference}` }))}
        canManage={canManage}
        clients={clients.map((client) => ({ id: client.id, label: client.name }))}
        companyId={company.id}
        manifestBookings={manifest?.entries.map((entry) => ({ id: entry.bookingId, label: `${entry.employeeName} — ${entry.bookingReference}` })) ?? []}
        routes={routes.map((route) => ({ id: route.id, label: route.name }))}
        selectedTripId={selected?.id ?? null}
        selectedTripStatus={selected?.status ?? null}
        returnTo={returnTo}
      />

      <footer className="mt-8 border-t border-slate-200 pt-4">
        <p className="text-sm leading-6 text-slate-600">
          Dispatch assignment of vehicles and drivers arrives with the dispatch board slice. Dispatching requires
          both resources to be set on the trip.
        </p>
      </footer>
    </main>
  );
}
