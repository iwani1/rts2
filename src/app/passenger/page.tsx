import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import {
  getPassengerHome,
  PassengerNotLinkedError,
  type PassengerHome,
  type PassengerJourney,
} from '@/modules/passenger/passenger';
import { JourneyActions, JourneyRequestForm } from './passenger-actions';

export const dynamic = 'force-dynamic';

function JourneyCard({
  companyId, journey,
}: {
  companyId: string; journey: PassengerJourney;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-950">{journey.reference}</h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
          {journey.status}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div><dt className="font-medium text-slate-500">Date</dt><dd>{journey.journeyDate}</dd></div>
        <div><dt className="font-medium text-slate-500">Type</dt><dd>{journey.bookingType.replaceAll('_', ' ')}</dd></div>
        <div><dt className="font-medium text-slate-500">Pickup</dt><dd>{journey.pickupLocation ?? 'Your approved pickup point'}{journey.pickupTime ? ` at ${journey.pickupTime}` : ''}</dd></div>
        <div><dt className="font-medium text-slate-500">Drop-off</dt><dd>{journey.dropoffLocation ?? 'Your approved drop-off point'}</dd></div>
        {journey.tripReference ? (
          <div><dt className="font-medium text-slate-500">Bus</dt><dd>{journey.vehicleRegistration ?? 'To be confirmed'} ({journey.tripReference})</dd></div>
        ) : null}
      </dl>
      {journey.feedback ? (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Your feedback{journey.feedback.rating ? ` (${journey.feedback.rating}/5)` : ''}: “{journey.feedback.comment}”
        </p>
      ) : null}
      <JourneyActions
        companyId={companyId}
        bookingId={journey.bookingId}
        canCancel={journey.canCancel}
        status={journey.status}
        hasFeedback={journey.feedback !== null}
      />
    </article>
  );
}

export default async function PassengerPortalPage() {
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
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Expected exactly one active company before opening the passenger portal.</p>
      </main>
    );
  }
  const company = companies[0];

  let home: PassengerHome | null = null;
  let notLinked = false;
  try {
    home = await getPassengerHome({ actorId: session.user.id, companyId: company.id });
  } catch (error) {
    if (error instanceof PassengerNotLinkedError) notLinked = true;
    else throw error;
  }

  if (notLinked || !home) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">My transport</h1>
        <p className="mt-4 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          Your login is not linked to an employee transport record yet. Ask the operations team to
          link it, then sign in again — your journeys, pickup points and requests will appear here.
        </p>
        <p className="mt-4 text-sm"><Link className="font-medium text-slate-900 underline" href="/">Back to home</Link></p>
      </main>
    );
  }

  const [routes, locations] = await Promise.all([
    prisma.route.findMany({
      where: { companyId: company.id, clientId: home.profile.clientId, archivedAt: null, active: true },
      orderBy: { reference: 'asc' }, select: { id: true, reference: true, name: true }, take: 50,
    }),
    prisma.location.findMany({
      where: { companyId: company.id, archivedAt: null },
      orderBy: { name: 'asc' }, select: { id: true, name: true }, take: 200,
    }),
  ]);
  const eligible = home.profile.transportEligible === true;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">My transport</h1>
          <p className="mt-2 text-sm text-slate-600">
            {home.profile.fullName} · {home.profile.clientName}
            {home.profile.department ? ` · ${home.profile.department}` : ''}
          </p>
        </div>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/">
          Back to home
        </Link>
      </header>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">My details</h2>
          <dl className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex justify-between"><dt className="text-slate-500">Work location</dt><dd>{home.profile.workLocation ?? 'Not recorded'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Shift</dt><dd>{home.profile.shift ?? 'Not recorded'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Approved pickup</dt><dd>{home.profile.approvedPickupLocation ?? 'Not recorded'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Approved drop-off</dt><dd>{home.profile.approvedDropoffLocation ?? 'Not recorded'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Transport eligibility</dt><dd>{home.profile.transportEligible === null ? 'Not recorded' : home.profile.transportEligible ? 'Eligible' : 'Not eligible'}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            If any detail is wrong, contact your HR or operations team — records are corrected by
            them so bookings stay accurate for everyone.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Your transport arrangements</h2>
          {home.arrangements.contracts.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              {home.arrangements.contracts.map((contract) => (
                <li key={contract.reference}>{contract.reference} — {contract.serviceType ?? 'Staff transport'} ({contract.status})</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No active transport contract is recorded for your organisation yet.</p>
          )}
          {home.arrangements.routes.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              {home.arrangements.routes.map((route) => (
                <li key={route.reference}>
                  {route.reference} — {route.name}
                  {route.plannedStartTime ? ` · departs ${route.plannedStartTime}` : ''}
                  {route.operatingDays.length > 0 ? ` · ${route.operatingDays.join(', ')}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No routes are published for your organisation yet; you can still request a journey below.</p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Request a journey</h2>
        <div className="mt-4">
          <JourneyRequestForm
            companyId={company.id}
            routes={routes.map((route) => ({ id: route.id, label: `${route.reference} — ${route.name}` }))}
            locations={locations.map((location) => ({ id: location.id, label: location.name }))}
            eligible={eligible}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-950">Upcoming journeys</h2>
        <div className="mt-4 grid gap-4">
          {home.upcoming.map((journey) => (
            <JourneyCard companyId={company.id} journey={journey} key={journey.bookingId} />
          ))}
          {home.upcoming.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">No upcoming journeys. Request one above.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-950">Journey history</h2>
        <div className="mt-4 grid gap-4">
          {home.history.map((journey) => (
            <JourneyCard companyId={company.id} journey={journey} key={journey.bookingId} />
          ))}
          {home.history.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">No past journeys yet.</p>
          ) : null}
        </div>
      </section>

      <p className="mt-8 text-xs leading-5 text-slate-500">
        Journey states: Requested → Confirmed → Assigned to trip → Driver en route → Picked up →
        Completed. “Driver en route” means your trip has been dispatched or started; live vehicle
        tracking is not available.
      </p>
    </main>
  );
}
