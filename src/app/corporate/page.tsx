import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/auth';
import { getPrisma } from '@/server/prisma';
import { ClientBindingNotFoundError, getCorporateDashboard } from '@/modules/clients/dashboard';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

export default async function CorporateDashboardPage({
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
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Expected exactly one active company before opening the corporate dashboard.</p>
      </main>
    );
  }
  const company = companies[0];
  const fromDate = firstParam(params.fromDate);
  const toDate = firstParam(params.toDate);

  let dashboard: Awaited<ReturnType<typeof getCorporateDashboard>> | null = null;
  let notice: string | null = null;
  try {
    dashboard = await getCorporateDashboard({
      actorId: session.user.id, companyId: company.id,
      fromDate: fromDate || undefined, toDate: toDate || undefined,
    });
  } catch (error) {
    if (error instanceof ClientBindingNotFoundError) {
      notice = error.message;
    } else {
      throw error;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Corporate dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Your organisation&apos;s transport at a glance: bookings, employees, contracts, invoices and upcoming
            trips — limited to your own client&apos;s records only.
          </p>
        </div>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/">
          Back to home
        </Link>
      </header>

      {notice ? (
        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm text-amber-900">{notice}</p>
        </section>
      ) : dashboard ? (
        <>
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-950">{dashboard.client.name}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {dashboard.client.contactPerson ?? 'No contact recorded'}
              {dashboard.client.telephone ? ` · ${dashboard.client.telephone}` : ''}
              {dashboard.client.email ? ` · ${dashboard.client.email}` : ''}
            </p>
            <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
              <label className="grid gap-1 text-sm text-slate-700">
                Bookings from
                <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={fromDate ?? ''} name="fromDate" type="date" />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                Bookings to
                <input className="rounded-md border border-slate-300 px-3 py-2" defaultValue={toDate ?? ''} name="toDate" type="date" />
              </label>
              <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" type="submit">
                Apply window
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {dashboard.bookingCountsByStatus.map((row) => (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700" key={row.status}>
                  {row.status}: {row.count}
                </span>
              ))}
              {dashboard.bookingCountsByStatus.length === 0 ? (
                <span className="text-sm text-slate-600">No bookings in this window.</span>
              ) : null}
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-950">Recent bookings</h2>
            {dashboard.bookings.length ? (
              <table className="mt-3 w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr><th className="py-2 pr-4 font-medium">Employee</th><th className="py-2 pr-4 font-medium">Date</th><th className="py-2 pr-4 font-medium">Type</th><th className="py-2 pr-4 font-medium">Trip</th><th className="py-2 font-medium">Status</th></tr>
                </thead>
                <tbody>
                  {dashboard.bookings.map((booking) => (
                    <tr className="border-t border-slate-100" key={booking.bookingReference}>
                      <td className="py-2 pr-4">{booking.employeeName}</td>
                      <td className="py-2 pr-4">{booking.journeyDate}</td>
                      <td className="py-2 pr-4">{booking.bookingType}</td>
                      <td className="py-2 pr-4">{booking.tripReference ?? 'Not assigned'}</td>
                      <td className="py-2">{booking.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (<p className="mt-2 text-sm text-slate-600">No bookings recorded.</p>)}
          </section>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-950">Employees ({dashboard.employees.length})</h2>
              {dashboard.employees.length ? (
                <ul className="mt-3 grid gap-1 text-sm text-slate-700">
                  {dashboard.employees.map((employee) => (
                    <li key={employee.fullName}>
                      {employee.fullName}
                      {employee.department ? ` — ${employee.department}` : ''}
                      {employee.transportEligible === null ? ' (eligibility not recorded)' : employee.transportEligible ? '' : ' (not eligible)'}
                    </li>
                  ))}
                </ul>
              ) : (<p className="mt-2 text-sm text-slate-600">No employees recorded.</p>)}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-950">Contracts</h2>
              {dashboard.contracts.length ? (
                <ul className="mt-3 grid gap-1 text-sm text-slate-700">
                  {dashboard.contracts.map((contract) => (
                    <li key={contract.reference}>{contract.reference} — {contract.status}</li>
                  ))}
                </ul>
              ) : (<p className="mt-2 text-sm text-slate-600">No contracts recorded.</p>)}
              <h2 className="mt-5 text-base font-semibold text-slate-950">Invoices</h2>
              {dashboard.invoices.length ? (
                <ul className="mt-3 grid gap-1 text-sm text-slate-700">
                  {dashboard.invoices.map((invoice) => (
                    <li key={invoice.reference}>
                      {invoice.reference} — {invoice.periodStart} → {invoice.periodEnd} — {cedis(invoice.totalPesewas)}
                    </li>
                  ))}
                </ul>
              ) : (<p className="mt-2 text-sm text-slate-600">No invoices issued yet.</p>)}
            </section>
          </div>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-950">Upcoming trips</h2>
            {dashboard.upcomingTrips.length ? (
              <ul className="mt-3 grid gap-1 text-sm text-slate-700">
                {dashboard.upcomingTrips.map((trip) => (
                  <li key={trip.reference}>{trip.tripDate} — {trip.reference} ({trip.status}, {trip.passengerCount} passenger(s))</li>
                ))}
              </ul>
            ) : (<p className="mt-2 text-sm text-slate-600">No upcoming trips.</p>)}
          </section>
        </>
      ) : null}
    </main>
  );
}
