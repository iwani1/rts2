import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { getFinanceReport } from '@/modules/reports/finance-reports';
import { FINANCE_SCOPES } from '@/modules/reports/transport-reports';
import type { FinanceReport } from '@/modules/reports/finance-reports';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

export default async function FinanceReportPage({
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
        <p className="text-sm text-red-700">Expected exactly one active company before opening reports.</p>
      </main>
    );
  }
  const company = companies[0];
  const permission = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'report:export' });
  const canView = permission.allowed
    && permission.scopes.some((scope) => (FINANCE_SCOPES as readonly string[]).includes(scope));
  if (!canView) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Financial report access is not permitted for the signed-in user.</p>
        <p className="mt-2 text-sm text-slate-600"><Link className="font-medium text-slate-900 underline" href="/reports">Back to reports</Link></p>
      </main>
    );
  }

  const filters = {
    fromDate: firstParam(params.fromDate) || undefined,
    toDate: firstParam(params.toDate) || undefined,
    clientId: firstParam(params.clientId) || undefined,
  };
  let report: FinanceReport | null = null;
  let loadError: string | null = null;
  try {
    report = await getFinanceReport({ actorId: session.user.id, companyId: company.id, ...filters });
  } catch (error) {
    if (error instanceof ZodError) loadError = 'The selected filters are invalid. Use an end date on or after the start date, spanning at most 366 days.';
    else if (error instanceof PermissionDeniedError) loadError = 'Financial report access is not permitted for the signed-in user.';
    else throw error;
  }

  const clients = await prisma.client.findMany({
    where: { companyId: company.id, archivedAt: null },
    orderBy: { name: 'asc' }, select: { id: true, name: true }, take: 200,
  });
  const exportQuery = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value).map(([key, value]) => [key, value as string]),
  ).toString();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Financial report</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Headline totals are the finance dashboard&apos;s reconciled figures. Windowed revenue
            counts standing invoices by when they were issued; payments are dated by when they were
            received; the outstanding list is point-in-time.
          </p>
        </div>
        <div className="flex gap-2">
          {report ? (
            <a className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={`/api/companies/${company.id}/reports/finance/export${exportQuery ? `?${exportQuery}` : ''}`}>
              Export CSV
            </a>
          ) : null}
          {report ? (
            <a className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href={`/api/companies/${company.id}/reports/finance/export/pdf${exportQuery ? `?${exportQuery}` : ''}`}>
              Export PDF
            </a>
          ) : null}
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/reports">Reports</Link>
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/finance">Finance dashboard</Link>
        </div>
      </header>

      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm text-slate-700"><span className="mb-1 block font-medium text-slate-500">From</span>
          <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={filters.fromDate ?? ''} name="fromDate" type="date" /></label>
        <label className="text-sm text-slate-700"><span className="mb-1 block font-medium text-slate-500">To</span>
          <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={filters.toDate ?? ''} name="toDate" type="date" /></label>
        <label className="text-sm text-slate-700"><span className="mb-1 block font-medium text-slate-500">Client</span>
          <select className="rounded-md border border-slate-300 px-3 py-2" defaultValue={filters.clientId ?? ''} name="clientId">
            <option value="">All clients</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select></label>
        <button className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">Apply filters</button>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/reports/finance">Clear</Link>
      </form>

      {loadError ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{loadError}</p>
      ) : null}

      {report ? (
        <>
          <p className={`mt-6 rounded-lg border px-4 py-3 text-sm ${report.totals.reconciles
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-red-200 bg-red-50 text-red-800'}`} role="status">
            {report.totals.reconciles
              ? <>Reconciled: revenue {cedis(report.totals.recognizedRevenuePesewas)} = payments {cedis(report.totals.paymentsReceivedPesewas)} + outstanding {cedis(report.totals.outstandingPesewas)}.</>
              : <>Reconciliation warning: revenue {cedis(report.totals.recognizedRevenuePesewas)} does not equal payments {cedis(report.totals.paymentsReceivedPesewas)} + outstanding {cedis(report.totals.outstandingPesewas)}.</>}
          </p>

          <p className="mt-4 text-sm text-slate-600">
            Recognised revenue {cedis(report.totals.recognizedRevenuePesewas)} = corporate {cedis(report.totals.corporateRevenuePesewas)} + rentals {cedis(report.totals.rentalRevenuePesewas)} (all time, D-091).
          </p>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Revenue by client (window)</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Client</th><th className="px-4 py-2 font-medium">Invoices</th><th className="px-4 py-2 font-medium">Revenue</th></tr>
                </thead>
                <tbody>
                  {report.revenueByClient.map((row) => (
                    <tr className="border-t border-slate-100" key={row.clientId}>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.clientName}</td>
                      <td className="px-4 py-2 text-slate-700">{row.invoiceCount}</td>
                      <td className="px-4 py-2 text-slate-700">{cedis(row.revenuePesewas)}</td>
                    </tr>
                  ))}
                  {report.revenueByClient.length === 0 ? (
                    <tr><td className="px-4 py-4 text-slate-600" colSpan={3}>No invoices issued in the window.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Revenue by service (window)</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Service</th><th className="px-4 py-2 font-medium">Invoices</th><th className="px-4 py-2 font-medium">Revenue</th></tr>
                </thead>
                <tbody>
                  {report.revenueByService.map((row) => (
                    <tr className="border-t border-slate-100" key={row.serviceType}>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.serviceType}</td>
                      <td className="px-4 py-2 text-slate-700">{row.invoiceCount}</td>
                      <td className="px-4 py-2 text-slate-700">{cedis(row.revenuePesewas)}</td>
                    </tr>
                  ))}
                  {report.revenueByService.length === 0 ? (
                    <tr><td className="px-4 py-4 text-slate-600" colSpan={3}>No invoices issued in the window.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                Payments received in window — {cedis(report.paymentsInWindow.totalPesewas)}
              </h2>
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Method</th><th className="px-4 py-2 font-medium">Payments</th><th className="px-4 py-2 font-medium">Amount</th></tr>
                </thead>
                <tbody>
                  {report.paymentsInWindow.byMethod.map((row) => (
                    <tr className="border-t border-slate-100" key={row.method}>
                      <td className="px-4 py-2 font-medium text-slate-900">{row.method}</td>
                      <td className="px-4 py-2 text-slate-700">{row.paymentCount}</td>
                      <td className="px-4 py-2 text-slate-700">{cedis(row.amountPesewas)}</td>
                    </tr>
                  ))}
                  {report.paymentsInWindow.byMethod.length === 0 ? (
                    <tr><td className="px-4 py-4 text-slate-600" colSpan={3}>No payments received in the window.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Data coverage</h2>
              <dl className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex justify-between"><dt>Issued invoices with an issue timestamp</dt><dd>{report.coverage.issuedInvoicesWithTimestamp.numerator} / {report.coverage.issuedInvoicesWithTimestamp.denominator}</dd></div>
                <div className="flex justify-between"><dt>Payments with a recorded method</dt><dd>{report.coverage.paymentsWithMethod.numerator} / {report.coverage.paymentsWithMethod.denominator}</dd></div>
                <div className="flex justify-between"><dt>Payments with an external reference</dt><dd>{report.coverage.paymentsWithReference.numerator} / {report.coverage.paymentsWithReference.denominator}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-slate-500">Generated {new Date(report.generatedAt).toISOString()}.</p>
            </div>
          </section>

          <section className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
            <h2 className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
              Outstanding invoices ({report.outstandingInvoices.totalCount}) — {cedis(report.outstandingInvoices.totalOutstandingPesewas)}
            </h2>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Reference</th><th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Period</th><th className="px-4 py-2 font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Paid</th><th className="px-4 py-2 font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {report.outstandingInvoices.invoices.map((row) => (
                  <tr className="border-t border-slate-100" key={row.reference}>
                    <td className="px-4 py-2 font-medium text-slate-900">{row.reference}</td>
                    <td className="px-4 py-2 text-slate-700">{row.clientName}</td>
                    <td className="px-4 py-2 text-slate-700">{row.periodStart} → {row.periodEnd}</td>
                    <td className="px-4 py-2 text-slate-700">{cedis(row.totalPesewas)}</td>
                    <td className="px-4 py-2 text-slate-700">{cedis(row.paidPesewas)}</td>
                    <td className="px-4 py-2 text-slate-700">{cedis(row.outstandingPesewas)}</td>
                  </tr>
                ))}
                {report.outstandingInvoices.invoices.length === 0 ? (
                  <tr><td className="px-4 py-4 text-slate-600" colSpan={6}>No invoices with an outstanding balance.</td></tr>
                ) : null}
              </tbody>
            </table>
            {report.outstandingInvoices.listedCount < report.outstandingInvoices.totalCount ? (
              <p className="px-4 py-3 text-xs text-slate-500">
                Showing the {report.outstandingInvoices.listedCount} largest of {report.outstandingInvoices.totalCount} outstanding invoices; the CSV export carries the same list.
              </p>
            ) : null}
          </section>

          <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-semibold text-amber-900">Not shown — insufficient data</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {report.unavailableMetrics.map((item) => (
                <li key={item.metric}><span className="font-medium">{item.metric}:</span> {item.reason}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
