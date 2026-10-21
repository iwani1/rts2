import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import {
  getMaintenanceCostAnalytics,
  type MaintenanceCostAnalytics,
} from '@/modules/maintenance/cost-analytics';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

export default async function MaintenanceAnalyticsPage({
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
        <p className="text-sm text-red-700">Expected exactly one active company before opening maintenance analytics.</p>
      </main>
    );
  }
  const company = companies[0];
  const fromDate = firstParam(params.fromDate) || undefined;
  const toDate = firstParam(params.toDate) || undefined;

  let analytics: MaintenanceCostAnalytics | null = null;
  let loadError: string | null = null;
  try {
    analytics = await getMaintenanceCostAnalytics({
      actorId: session.user.id, companyId: company.id, fromDate, toDate,
    });
  } catch (error) {
    if (error instanceof ZodError) loadError = 'The selected date window is invalid. Use an end date on or after the start date, spanning at most 366 days.';
    else if (error instanceof PermissionDeniedError) loadError = 'Maintenance analytics access is not permitted for the signed-in user.';
    else throw error;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Maintenance cost analytics</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Recorded work-order costs only (MNT-04, D-083). Spend covers finished work orders by
            completion date; repair turnaround is the recorded report-to-completion time, not
            fleet availability. Nothing is imputed for work orders without recorded costs.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/fleet/maintenance">
            Work orders
          </Link>
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/">
            Back to home
          </Link>
        </div>
      </header>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium text-slate-500">From</span>
          <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={fromDate ?? ''} name="fromDate" type="date" />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium text-slate-500">To</span>
          <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={toDate ?? ''} name="toDate" type="date" />
        </label>
        <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Apply window</button>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/fleet/maintenance/analytics">Clear</Link>
      </form>

      {loadError ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{loadError}</p>
      ) : null}

      {analytics ? (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Maintenance cost totals">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Recorded spend (finished work)</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{cedis(analytics.partsVsLabour.totalPesewas)}</p>
              <p className="mt-1 text-xs text-slate-500">{analytics.finishedWithAnyCost} of {analytics.finishedWorkOrders} finished work orders have recorded costs.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Labour</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{cedis(analytics.partsVsLabour.labourPesewas)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Parts</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{cedis(analytics.partsVsLabour.partsPesewas)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Open backlog</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{analytics.openBacklog.count}</p>
              <p className="mt-1 text-xs text-slate-500">Unfinished work orders, aged by report date below.</p>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Spend by vehicle</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Vehicle</th><th className="px-4 py-2 font-medium">Finished</th><th className="px-4 py-2 font-medium">With costs</th><th className="px-4 py-2 font-medium">Total</th><th className="px-4 py-2 font-medium">Avg repair days</th></tr>
                </thead>
                <tbody>
                  {analytics.spendByVehicle.map((row) => (
                    <tr className="border-t border-slate-100" key={row.vehicleId}>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.registrationNumber}</td>
                      <td className="px-4 py-2 text-slate-700">{row.workOrderCount}</td>
                      <td className="px-4 py-2 text-slate-700">{row.withCostCount}</td>
                      <td className="px-4 py-2 text-slate-700">{cedis(row.totalPesewas)}</td>
                      <td className="px-4 py-2 text-slate-700">{row.averageTurnaroundDays === null ? '—' : row.averageTurnaroundDays}</td>
                    </tr>
                  ))}
                  {analytics.spendByVehicle.length === 0 ? (
                    <tr><td className="px-4 py-4 text-slate-600" colSpan={5}>No finished work orders on this basis yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Repairs by type</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Work type</th><th className="px-4 py-2 font-medium">Finished</th><th className="px-4 py-2 font-medium">Recorded cost</th></tr>
                </thead>
                <tbody>
                  {analytics.repairsByType.map((row) => (
                    <tr className="border-t border-slate-100" key={row.workType}>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.workType}</td>
                      <td className="px-4 py-2 text-slate-700">{row.workOrderCount}</td>
                      <td className="px-4 py-2 text-slate-700">{cedis(row.totalPesewas)}</td>
                    </tr>
                  ))}
                  {analytics.repairsByType.length === 0 ? (
                    <tr><td className="px-4 py-4 text-slate-600" colSpan={3}>No finished work orders on this basis yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Recurring faults (same vehicle, 2+ reports)</h2>
              {analytics.recurringWorkTypes.length === 0 && analytics.recurringFaults.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No repeated work types or identical fault descriptions on this basis.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {analytics.recurringWorkTypes.map((row) => (
                    <li key={`t-${row.registrationNumber}-${row.workType}`}>{row.registrationNumber} — {row.workType}: {row.occurrences}×</li>
                  ))}
                  {analytics.recurringFaults.map((row) => (
                    <li key={`f-${row.registrationNumber}-${row.reportedFault}`}>{row.registrationNumber} — “{row.reportedFault}”: {row.occurrences}×</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Open backlog by age</h2>
              {analytics.openBacklog.workOrders.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No unfinished work orders.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {analytics.openBacklog.workOrders.map((row) => (
                    <li key={row.reference}>{row.reference} · {row.registrationNumber} · {row.status} · reported {row.dateReported} ({row.ageDays}d)</li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-semibold text-amber-900">Not shown — insufficient data</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {analytics.unavailableMetrics.map((item) => (
                <li key={item.metric}><span className="font-medium">{item.metric}:</span> {item.reason}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
