import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { listCorporateInvoices } from '@/modules/finance/invoices';
import { getProviderConfig, listProviderPaymentEvents } from '@/modules/finance/provider-payments';
import ApplyEventForm from './ApplyEventForm';

export const dynamic = 'force-dynamic';

function cedis(pesewas: number | null) {
  return pesewas === null ? '—' : `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

export default async function ProviderPaymentsPage() {
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
        <p className="text-sm text-red-700">Expected exactly one active company before opening provider payments.</p>
      </main>
    );
  }
  const company = companies[0];
  const config = getProviderConfig();

  let events: Awaited<ReturnType<typeof listProviderPaymentEvents>>['events'] = [];
  let issued: Array<{ id: string; reference: string; outstandingPesewas: number }> = [];
  let loadError: string | null = null;
  try {
    events = (await listProviderPaymentEvents({ actorId: session.user.id, companyId: company.id })).events;
    const issuedList = await listCorporateInvoices({
      actorId: session.user.id, companyId: company.id, status: 'ISSUED',
    });
    issued = issuedList.invoices.map((invoice) => ({
      id: invoice.id, reference: invoice.reference, outstandingPesewas: invoice.outstandingPesewas,
    }));
  } catch (error) {
    if (error instanceof PermissionDeniedError) loadError = 'Provider payment access is not permitted for the signed-in user.';
    else throw error;
  }
  const received = events.filter((event) => event.status === 'RECEIVED');
  const settled = events.filter((event) => event.status !== 'RECEIVED');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Provider payments</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Verified Paystack webhooks land here first (FIN-04, D-084). Nothing becomes an invoice
            payment until an authorised user applies it — a browser redirect is never proof of payment,
            and repeated webhook delivery can never double-record.
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

      <p className={`mt-6 rounded-lg border px-4 py-3 text-sm ${config.configured
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-slate-200 bg-slate-50 text-slate-700'}`} role="status">
        <strong>{config.configured ? 'Configured — not verified live. ' : 'Not configured. '}</strong>
        {config.note}
      </p>

      {loadError ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{loadError}</p>
      ) : (
        <>
          <section className="mt-8" aria-label="Awaiting application">
            <h2 className="text-lg font-semibold text-slate-950">Awaiting application ({received.length})</h2>
            {received.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No verified provider payments are waiting.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {received.map((event) => (
                  <li key={event.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <p className="text-sm text-slate-900">
                      <strong>{event.providerReference}</strong> · {cedis(event.amountPesewas)} · paid {event.paidDate ?? 'date unknown'}
                      {event.invoiceReference ? <> · invoice hint {event.invoiceReference}</> : null}
                    </p>
                    <ApplyEventForm companyId={company.id} eventId={event.id} invoices={issued} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mt-10" aria-label="Settled provider events">
            <h2 className="text-lg font-semibold text-slate-950">Settled ({settled.length})</h2>
            {settled.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Nothing applied or ignored yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {settled.map((event) => (
                  <li key={event.id} className="rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">
                    <strong className="text-slate-900">{event.providerReference}</strong> · {cedis(event.amountPesewas)} · {event.status}
                    {event.note ? <> · {event.note}</> : null}
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
