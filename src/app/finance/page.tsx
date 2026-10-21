import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { getFinanceDashboard, type FinanceDashboard } from '@/modules/finance/dashboard';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

export default async function FinanceDashboardPage({
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
        <p className="text-sm text-red-700">Expected exactly one active company before opening the finance dashboard.</p>
      </main>
    );
  }
  const company = companies[0];
  const permission = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'invoice:manage' });
  const canView = permission.allowed
    && (permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY'));
  if (!canView) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Finance dashboard access is not permitted for the signed-in user.</p>
        <p className="mt-2 text-sm text-slate-600">
          <Link className="font-medium text-slate-900 underline" href="/">Back to home</Link>
        </p>
      </main>
    );
  }

  const fromDate = firstParam(params.fromDate) || undefined;
  const toDate = firstParam(params.toDate) || undefined;
  let dashboard: FinanceDashboard | null = null;
  let loadError: string | null = null;
  try {
    dashboard = await getFinanceDashboard({
      actorId: session.user.id, companyId: company.id, fromDate, toDate,
    });
  } catch (error) {
    if (error instanceof ZodError) loadError = 'The selected date window is invalid. Use an end date on or after the start date, spanning at most 366 days.';
    else if (error instanceof PermissionDeniedError) loadError = 'Finance dashboard access is not permitted for the signed-in user.';
    else throw error;
  }

  const windowLabel = dashboard
    ? (dashboard.window.fromDate || dashboard.window.toDate
      ? `${dashboard.window.fromDate ?? '…'} → ${dashboard.window.toDate ?? '…'}`
      : 'all time')
    : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Finance dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Every figure below is derived from the corporate invoice and payment records themselves:
            revenue counts invoices that have been issued and not voided, payments are the recorded
            payment sums, and outstanding is each issued invoice&apos;s total minus its payments.
            Draft invoices are pipeline only, and margin is shown only when attributable cost
            records exist — they do not yet, so no margin figure is presented.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/invoices">
            Invoices
          </Link>
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/finance/expenses">
            Expenses
          </Link>
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/finance/provider-payments">
            Provider payments
          </Link>
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/">
            Back to home
          </Link>
        </div>
      </header>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium text-slate-500">Activity from</span>
          <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={fromDate ?? ''} name="fromDate" type="date" />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block font-medium text-slate-500">Activity to</span>
          <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={toDate ?? ''} name="toDate" type="date" />
        </label>
        <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Apply window</button>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/finance">Clear</Link>
      </form>

      {loadError ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{loadError}</p>
      ) : null}

      {dashboard ? (
        <>
          <p className={`mt-6 rounded-lg border px-4 py-3 text-sm ${dashboard.reconciliation.reconciles
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-red-200 bg-red-50 text-red-800'}`} role="status">
            {dashboard.reconciliation.reconciles
              ? <>Reconciled: recognised revenue {cedis(dashboard.reconciliation.recognizedRevenuePesewas)} = payments received {cedis(dashboard.reconciliation.paymentsReceivedPesewas)} + outstanding {cedis(dashboard.reconciliation.outstandingPesewas)}.</>
              : <>Reconciliation warning: recognised revenue {cedis(dashboard.reconciliation.recognizedRevenuePesewas)} does not equal payments {cedis(dashboard.reconciliation.paymentsReceivedPesewas)} + outstanding {cedis(dashboard.reconciliation.outstandingPesewas)}. Investigate before relying on these figures.</>}
          </p>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Finance totals">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Recognised revenue</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{cedis(dashboard.recognizedRevenuePesewas)}</p>
              <p className="mt-1 text-xs text-slate-500">Issued + paid invoice totals; drafts and voids excluded.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Payments received</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{cedis(dashboard.paymentsReceivedPesewas)}</p>
              <p className="mt-1 text-xs text-slate-500">Sum of all recorded invoice payments.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Outstanding</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{cedis(dashboard.outstandingPesewas)}</p>
              <p className="mt-1 text-xs text-slate-500">Still owed on issued invoices, derived per invoice.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Draft pipeline</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{cedis(dashboard.draftPipelinePesewas)}</p>
              <p className="mt-1 text-xs text-slate-500">{dashboard.draftInvoiceCount} draft invoice(s), not yet revenue.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Approved expenses ({dashboard.margin.basis === 'window' ? 'in window' : 'all time'})</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{cedis(dashboard.expenses.approvedPesewas)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {dashboard.expenses.pendingCount} pending ({cedis(dashboard.expenses.pendingPesewas)}) not yet effective.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">Estimated gross margin</p>
              {dashboard.margin.status === 'ESTIMATED' ? (
                <>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{cedis(dashboard.margin.marginPesewas)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Revenue {cedis(dashboard.margin.revenuePesewas)} minus approved costs {cedis(dashboard.margin.approvedCostsPesewas)} ({dashboard.margin.basis}). Estimated — not audited profit.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">{dashboard.margin.reason}</p>
              )}
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Approved expenses by category</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Category</th><th className="px-4 py-2 font-medium">Expenses</th><th className="px-4 py-2 font-medium">Amount</th></tr>
                </thead>
                <tbody>
                  {dashboard.expenses.byCategory.map((row) => (
                    <tr className="border-t border-slate-100" key={row.category}>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.category}</td>
                      <td className="px-4 py-2 text-slate-700">{row.expenseCount}</td>
                      <td className="px-4 py-2 text-slate-700">{cedis(row.amountPesewas)}</td>
                    </tr>
                  ))}
                  {dashboard.expenses.byCategory.length === 0 ? (
                    <tr><td className="px-4 py-4 text-slate-600" colSpan={3}>No approved expenses on this basis yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Cost per completed trip</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Trip date</th><th className="px-4 py-2 font-medium">Approved cost</th><th className="px-4 py-2 font-medium">Passengers</th><th className="px-4 py-2 font-medium">Per passenger</th></tr>
                </thead>
                <tbody>
                  {dashboard.expenses.tripCosts.map((row) => (
                    <tr className="border-t border-slate-100" key={row.tripId}>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.tripDate}</td>
                      <td className="px-4 py-2 text-slate-700">{cedis(row.approvedCostPesewas)}</td>
                      <td className="px-4 py-2 text-slate-700">{row.completedJourneys}</td>
                      <td className="px-4 py-2 text-slate-700">{row.costPerPassengerPesewas === null ? '—' : cedis(row.costPerPassengerPesewas)}</td>
                    </tr>
                  ))}
                  {dashboard.expenses.tripCosts.length === 0 ? (
                    <tr><td className="px-4 py-4 text-slate-600" colSpan={4}>No completed trips carry approved trip expenses yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Invoices by status</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Invoices</th><th className="px-4 py-2 font-medium">Total</th></tr>
                </thead>
                <tbody>
                  {dashboard.countsByStatus.map((row) => (
                    <tr className="border-t border-slate-100" key={row.status}>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.status}</td>
                      <td className="px-4 py-2 text-slate-700">{row.invoiceCount}</td>
                      <td className="px-4 py-2 text-slate-700">{cedis(row.totalPesewas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Payments by method (all time)</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Method</th><th className="px-4 py-2 font-medium">Payments</th><th className="px-4 py-2 font-medium">Amount</th></tr>
                </thead>
                <tbody>
                  {dashboard.paymentsByMethod.map((row) => (
                    <tr className="border-t border-slate-100" key={row.method}>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.method}</td>
                      <td className="px-4 py-2 text-slate-700">{row.paymentCount}</td>
                      <td className="px-4 py-2 text-slate-700">{cedis(row.amountPesewas)}</td>
                    </tr>
                  ))}
                  {dashboard.paymentsByMethod.length === 0 ? (
                    <tr><td className="px-4 py-4 text-slate-600" colSpan={3}>No payments recorded yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
            <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">By corporate client (standing invoices)</h2>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Invoices</th>
                  <th className="px-4 py-2 font-medium">Invoiced</th>
                  <th className="px-4 py-2 font-medium">Paid</th>
                  <th className="px-4 py-2 font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.clients.map((client) => (
                  <tr className="border-t border-slate-100" key={client.clientId}>
                    <td className="px-4 py-2 font-medium text-slate-900">{client.clientName}</td>
                    <td className="px-4 py-2 text-slate-700">{client.standingInvoiceCount}</td>
                    <td className="px-4 py-2 text-slate-700">{cedis(client.invoicedPesewas)}</td>
                    <td className="px-4 py-2 text-slate-700">{cedis(client.paidPesewas)}</td>
                    <td className="px-4 py-2 text-slate-700">{cedis(client.outstandingPesewas)}</td>
                  </tr>
                ))}
                {dashboard.clients.length === 0 ? (
                  <tr><td className="px-4 py-4 text-slate-600" colSpan={5}>No issued invoices yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Activity ({windowLabel})</h2>
              <dl className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex justify-between"><dt>Payments received</dt><dd>{cedis(dashboard.activity.paymentsReceivedPesewas)} ({dashboard.activity.paymentCount})</dd></div>
                <div className="flex justify-between"><dt>Invoices issued (still standing)</dt><dd>{dashboard.activity.invoicesIssuedCount}</dd></div>
                <div className="flex justify-between"><dt>Revenue recognised</dt><dd>{cedis(dashboard.activity.revenueRecognizedPesewas)}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-slate-500">
                Activity is dated by when payments were received and when invoices were issued;
                balances above are point-in-time and ignore the window.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Data coverage</h2>
              <dl className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex justify-between"><dt>Issued invoices with an issue timestamp</dt><dd>{dashboard.coverage.issuedInvoicesWithTimestamp.numerator} / {dashboard.coverage.issuedInvoicesWithTimestamp.denominator}</dd></div>
                <div className="flex justify-between"><dt>Payments with a recorded method</dt><dd>{dashboard.coverage.paymentsWithMethod.numerator} / {dashboard.coverage.paymentsWithMethod.denominator}</dd></div>
                <div className="flex justify-between"><dt>Payments with an external reference</dt><dd>{dashboard.coverage.paymentsWithReference.numerator} / {dashboard.coverage.paymentsWithReference.denominator}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-slate-500">Generated {new Date(dashboard.generatedAt).toISOString()}.</p>
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-semibold text-amber-900">Not shown — insufficient data</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {dashboard.unavailableMetrics.map((item) => (
                <li key={item.metric}><span className="font-medium">{item.metric}:</span> {item.reason}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
