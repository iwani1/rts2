import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { listServiceReminders } from '@/modules/maintenance/service-plans';
import { NotifyFleetButton, ServicePlanForms } from './service-plan-actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  OVERDUE: 'Overdue',
  DUE_SOON: 'Due soon',
  OK: 'Up to date',
  NO_PLAN: 'No plan',
};

/** MNT-03 (D-075): preventive-service plans and the reminder register. */
export default async function ServicePlansPage() {
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
      <p className="text-sm text-red-700">Expected exactly one active company before opening service plans.</p>
    </main>;
  }
  const company = companies[0];

  let result: Awaited<ReturnType<typeof listServiceReminders>> | null = null;
  let denied = false;
  try {
    result = await listServiceReminders({ actorId: session.user.id, companyId: company.id });
  } catch (error) {
    if (error instanceof PermissionDeniedError) denied = true;
    else throw error;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">Preventive service reminders</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Due dates are worked out from each vehicle&apos;s service plan and last recorded service.
          A passed date never marks maintenance complete — record the service when it is done.
        </p>
        <p className="mt-2 text-sm">
          <Link className="font-medium text-slate-900 underline" href="/fleet/maintenance">← Maintenance work orders</Link>
        </p>
      </header>

      {denied || !result ? (
        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm text-amber-900">Service plans are managed by the fleet/maintenance team. Your login does not include that access.</p>
        </section>
      ) : (
        <>
          <div className="mt-6">
            <NotifyFleetButton companyId={company.id} />
          </div>
          <section className="mt-4 grid gap-3">
            {result.reminders.map((row) => (
              <article className="rounded-lg border border-slate-200 bg-white p-4" key={row.vehicleId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-950">{row.registrationNumber}</h3>
                  <span className="status-pill">{STATUS_LABEL[row.status] ?? row.status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {row.hasPlan
                    ? `Last service ${row.lastServiceDate ?? 'not recorded'}`
                    : 'No service plan yet (date shown from the vehicle register, if any)'}
                  {row.dueDate ? ` · Due ${row.dueDate}` : ''}
                  {row.daysRemaining !== null
                    ? row.daysRemaining < 0
                      ? ` · ${Math.abs(row.daysRemaining)} day(s) overdue`
                      : ` · in ${row.daysRemaining} day(s)`
                    : ''}
                  {row.kmRemaining !== null
                    ? row.kmRemaining <= 0
                      ? ` · mileage due reached (${row.dueOdometerKm} km)`
                      : ` · ${Math.round(row.kmRemaining)} km remaining`
                    : ''}
                </p>
              </article>
            ))}
            {result.reminders.length === 0 ? (
              <p className="text-sm text-slate-600">No active vehicles yet.</p>
            ) : null}
          </section>

          <h2 className="mt-10 text-lg font-semibold text-slate-950">Plans &amp; completed services</h2>
          <ServicePlanForms companyId={company.id} reminders={result.reminders} />
        </>
      )}
    </main>
  );
}
