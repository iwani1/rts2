import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/server/auth';
import { resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { FINANCE_SCOPES, TRANSPORT_SCOPES } from '@/modules/reports/transport-reports';

export const dynamic = 'force-dynamic';

export default async function ReportsHubPage() {
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
        <p className="text-sm text-red-700">Expected exactly one active company before opening reports.</p>
      </main>
    );
  }
  const company = companies[0];
  const permission = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'report:export' });
  const canTransport = permission.allowed
    && permission.scopes.some((scope) => (TRANSPORT_SCOPES as readonly string[]).includes(scope));
  const canFinance = permission.allowed
    && permission.scopes.some((scope) => (FINANCE_SCOPES as readonly string[]).includes(scope));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Reports</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Every figure is computed from persisted records under the formulas in docs/KPIS.md.
            Metrics whose source data does not exist yet are labelled insufficient-data rather than
            estimated, and CSV exports contain only the records your permissions allow you to see.
          </p>
        </div>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/">
          Back to home
        </Link>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {canTransport ? (
          <Link className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400" href="/reports/transport">
            <h2 className="text-lg font-semibold text-slate-950">Staff transport &amp; fleet (RPT-02)</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Booking flow, no-shows, pickup delay, passengers transported, route utilisation,
              fleet, document expiry and maintenance — with CSV export (RPT-04).
            </p>
          </Link>
        ) : null}
        {canFinance ? (
          <Link className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400" href="/reports/finance">
            <h2 className="text-lg font-semibold text-slate-950">Financial report (RPT-03)</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Revenue by client and service, payments received, outstanding invoices — reconciled
              to the finance dashboard totals, with CSV export (RPT-04).
            </p>
          </Link>
        ) : null}
        <Link className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400" href="/rentals/reports">
          <h2 className="text-lg font-semibold text-slate-950">Rental requests (RPT-01)</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The existing all-time rental enquiry snapshot; financial rental metrics remain
            unavailable until rental invoices exist.
          </p>
        </Link>
        <Link className="rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400" href="/finance">
          <h2 className="text-lg font-semibold text-slate-950">Finance dashboard (FIN-07)</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Reconciled invoice and payment totals that the financial report builds on.
          </p>
        </Link>
      </section>
      {!canTransport && !canFinance ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          Report access is not permitted for the signed-in user.
        </p>
      ) : null}
    </main>
  );
}
