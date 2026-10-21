import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { listPayRules, listPayrollRuns } from '@/modules/finance/driver-pay';
import { CreateRuleForm, CreateRunForm, FinaliseRunActions, RuleDecisionActions } from './DriverPayActions';

export const dynamic = 'force-dynamic';

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

export default async function DriverPayPage() {
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
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Expected exactly one active company before opening driver pay.</p>
      </main>
    );
  }
  const company = companies[0];

  let rules: Awaited<ReturnType<typeof listPayRules>>['rules'] = [];
  let runs: Awaited<ReturnType<typeof listPayrollRuns>>['runs'] = [];
  let loadError: string | null = null;
  try {
    rules = (await listPayRules({ actorId: session.user.id, companyId: company.id })).rules;
    runs = (await listPayrollRuns({ actorId: session.user.id, companyId: company.id })).runs;
  } catch (error) {
    if (error instanceof PermissionDeniedError) loadError = 'Driver pay access is not permitted for the signed-in user.';
    else throw error;
  }
  const activeRules = rules.filter((rule) => rule.status === 'ACTIVE');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Driver pay</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Pay is computed only from pay rules an authorised user configured and a different user
            activated (FIN-06, D-086) — there is no built-in formula. Payroll runs snapshot the
            recorded trips, boardings and timed driving for a period; the CSV export is available
            only once a run is finalised by a second authorised user.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/finance">
            Finance dashboard
          </Link>
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/">
            Back to home
          </Link>
        </div>
      </header>

      {loadError ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{loadError}</p>
      ) : (
        <>
          <CreateRuleForm companyId={company.id} />
          <section className="mt-8" aria-label="Pay rules">
            <h2 className="text-lg font-semibold text-slate-950">Pay rules ({rules.length})</h2>
            {rules.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No pay rules yet. Without an active rule, no payroll figures can be produced.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {rules.map((rule) => (
                  <li key={rule.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <p className="text-sm text-slate-900">
                      <strong>{rule.reference}</strong> · {rule.name} · {rule.basis} at {cedis(rule.ratePesewas)} ·
                      from {rule.effectiveFrom}{rule.effectiveTo ? ` to ${rule.effectiveTo}` : ''} · <strong>{rule.status}</strong>
                    </p>
                    {rule.overtimeRatePesewasPerHour !== null ? (
                      <p className="mt-1 text-sm text-slate-600">
                        Overtime: beyond {rule.overtimeThresholdMinutesPerDay} recorded minutes/day at {cedis(rule.overtimeRatePesewasPerHour)}/hour.
                      </p>
                    ) : null}
                    <RuleDecisionActions companyId={company.id} ruleId={rule.id} status={rule.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <CreateRunForm companyId={company.id} activeRules={activeRules} />
          <section className="mt-8" aria-label="Payroll runs">
            <h2 className="text-lg font-semibold text-slate-950">Payroll runs ({runs.length})</h2>
            {runs.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No payroll runs yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {runs.map((run) => (
                  <li key={run.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <p className="text-sm text-slate-900">
                      <strong>{run.reference}</strong> · {run.periodStart} → {run.periodEnd} · {run.ruleName} ·{' '}
                      {run.totals.drivers} driver(s) · total {cedis(run.totals.totalPesewas)} · <strong>{run.status}</strong>
                    </p>
                    {run.totals.tripsWithoutTiming > 0 ? (
                      <p className="mt-1 text-sm text-amber-700">
                        {run.totals.tripsWithoutTiming} completed trip(s) lacked full START/COMPLETE timing and were excluded from overtime.
                      </p>
                    ) : null}
                    {run.lines.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        {run.lines.map((line) => (
                          <li key={line.driverId}>
                            {line.driverName}: {line.completedTrips} trip(s), {line.boardings} boarding(s), {line.activeDays} day(s) → {cedis(line.totalPesewas)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {run.status === 'OPEN' ? (
                      <FinaliseRunActions companyId={company.id} runId={run.id} />
                    ) : (
                      <p className="mt-3">
                        <a className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={`/api/companies/${company.id}/payroll-runs/${run.id}/export`}>
                          Download payroll CSV
                        </a>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
