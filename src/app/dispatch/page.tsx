import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/server/auth';
import { resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { getDispatchBoard, type DispatchBoardTrip } from '@/modules/dispatch/dispatch';
import { getTripManifest } from '@/modules/trips/trips';
import { getTripWaitingList } from '@/modules/dispatch/waiting-list';
import { DispatchManager } from './dispatch-manager';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function warningText(warning: DispatchBoardTrip['warnings'][number]) {
  switch (warning.type) {
    case 'VEHICLE_DAY_CONFLICT': return `Vehicle already on trip ${warning.otherTripReference} today`;
    case 'DRIVER_DAY_CONFLICT': return `Driver already on trip ${warning.otherTripReference} today`;
    case 'VEHICLE_SEATS_BELOW_REQUIREMENT': return `Vehicle seats (${warning.seatCount}) below requirement (${warning.required})`;
    case 'PASSENGERS_EXCEED_VEHICLE_SEATS': return `${warning.passengers} passengers exceed ${warning.seatCount} seats`;
    case 'VEHICLE_ARCHIVED': return 'Vehicle is archived';
    case 'VEHICLE_SAFETY_BLOCKED': return 'Vehicle has an active safety block';
    case 'DRIVER_ARCHIVED': return 'Driver is archived';
    case 'DRIVER_LICENCE_EXPIRED': return `Driver licence expired ${warning.licenceExpiresAt}`;
  }
}

export default async function DispatchPage({
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
        <p className="text-sm text-red-700">Expected exactly one active company before opening the dispatch board.</p>
      </main>
    );
  }
  const company = companies[0];
  const permission = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'trip:dispatch' });
  if (!permission.allowed) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Dispatch access is not permitted for the signed-in user.</p>
      </main>
    );
  }

  const date = firstParam(params.date) ?? new Date().toISOString().slice(0, 10);
  const selectedId = firstParam(params.trip);
  const board = await getDispatchBoard({ actorId: session.user.id, companyId: company.id, date });
  const selected = board.trips.find((trip) => trip.id === selectedId) ?? board.trips[0] ?? null;
  const selectedManifest = selected
    ? await getTripManifest({ actorId: session.user.id, companyId: company.id, tripId: selected.id })
    : null;
  const waitingList = selected
    ? await getTripWaitingList({ actorId: session.user.id, companyId: company.id, tripId: selected.id })
    : null;
  const [vehicles, drivers] = await Promise.all([
    prisma.vehicle.findMany({
      where: { companyId: company.id, archivedAt: null },
      orderBy: { registrationNumber: 'asc' },
      select: { id: true, registrationNumber: true, seatCount: true },
      take: 300,
    }),
    prisma.driver.findMany({
      where: { companyId: company.id, archivedAt: null },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true },
      take: 300,
    }),
  ]);
  const returnTo = `/dispatch?${new URLSearchParams({
    date, ...(selected ? { trip: selected.id } : {}),
  }).toString()}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Dispatch board</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            One day at a time: trips, resources, passenger load and assignment conflicts. The board works with no
            map provider and makes no routing claims. Safety blocks and expired licences cannot be overridden.
          </p>
        </div>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/">
          Back to home
        </Link>
      </header>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm text-slate-700">
          Dispatch date
          <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={date} name="date" type="date" />
        </label>
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">
          Load board
        </button>
      </form>

      <section className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Start</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Vehicle</th>
              <th className="px-4 py-3 font-medium">Driver</th>
              <th className="px-4 py-3 font-medium">Load</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Warnings</th>
              <th className="px-4 py-3 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {board.trips.map((trip) => (
              <tr className="border-t border-slate-100" key={trip.id}>
                <td className="px-4 py-3 text-slate-700">{trip.plannedStartTime ?? '—'}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{trip.reference}</td>
                <td className="px-4 py-3 text-slate-700">{trip.routeName ?? 'Ad hoc'}</td>
                <td className="px-4 py-3 text-slate-700">{trip.vehicleRegistration ?? 'Not assigned'}</td>
                <td className="px-4 py-3 text-slate-700">{trip.driverName ?? 'Not assigned'}</td>
                <td className="px-4 py-3 text-slate-700">
                  {trip.passengerCount}{trip.capacityBasis ? ` / ${trip.capacityBasis}` : ''}
                </td>
                <td className="px-4 py-3 text-slate-700">{trip.status}</td>
                <td className="px-4 py-3 text-amber-700">
                  {trip.warnings.length ? trip.warnings.map(warningText).join('; ') : '—'}
                </td>
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-slate-900 underline"
                    href={`/dispatch?${new URLSearchParams({ date, trip: trip.id }).toString()}`}
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
            {board.trips.length === 0 ? (
              <tr><td className="px-4 py-6 text-slate-600" colSpan={9}>No trips on this date. Generate trips from schedules on the Trips page.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-base font-semibold text-slate-950">Accepted bookings not yet on a trip ({board.unassignedAcceptedBookings.length})</h2>
        {board.unassignedAcceptedBookings.length ? (
          <p className="mt-2 text-sm text-slate-700">
            {board.unassignedAcceptedBookings.map((booking) => `${booking.employeeName} (${booking.bookingReference})`).join(', ')}
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">Every accepted booking for this date is on a trip.</p>
        )}
      </section>

      {waitingList ? (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">
            Waiting list — {waitingList.tripReference} ({waitingList.entries.length})
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {waitingList.capacityNote} Seats available: {waitingList.seatsAvailable === null
              ? 'unknown (no capacity basis)'
              : waitingList.seatsAvailable ? 'yes' : 'no — promotions need a bigger vehicle or another trip'}.
            Promotion is manual: assign from the Trips page; capacity is rechecked transactionally.
          </p>
          {waitingList.entries.length ? (
            <ol className="mt-3 grid gap-1 text-sm text-slate-700">
              {waitingList.entries.map((entry) => (
                <li key={entry.bookingId}>
                  {entry.position}. {entry.employeeName} — {entry.bookingReference} ({entry.bookingType})
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Nobody is waiting for this trip.</p>
          )}
        </section>
      ) : null}

      <DispatchManager
        companyId={company.id}
        drivers={drivers.map((driver) => ({ id: driver.id, label: driver.fullName }))}
        returnTo={returnTo}
        selectedTripId={selected?.id ?? null}
        selectedTripStatus={selected?.status ?? null}
        selectedManifest={selectedManifest ? {
          trip: selectedManifest.trip,
          entries: selectedManifest.entries,
        } : null}
        vehicles={vehicles.map((vehicle) => ({
          id: vehicle.id,
          label: `${vehicle.registrationNumber}${vehicle.seatCount ? ` (${vehicle.seatCount} seats)` : ''}`,
        }))}
      />
    </main>
  );
}
