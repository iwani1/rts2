import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { listReconciliations } from '@/modules/finance/reconciliations';
import ReconciliationActions from './ReconciliationActions';

export const dynamic = 'force-dynamic';

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

export default async function ReconciliationPage() {
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
        <p className="text-sm text-red-700">Expected exactly one active company before opening reconciliation.</p>
      </main>
    );
  }
  const company = companies[0];

  let runs: Awaited<ReturnType<typeof listReconciliations>>['reconciliations'] = [];
  let loadError: string | null = null;
  try {
    runs = (await listReconciliations({ actorId: session.user.id, companyId: company.id })).reconciliations;
  } catch (error) {
    if (error instanceof PermissionDeniedError) loadError = 'Reconciliation access is not permitted for the signed-in user.';
    else throw error;
  }
  const open = runs.filter((run) => run.status === 'OPEN');
  const closed = runs.filter((run) => run.status === 'CLOSED');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Payment reconciliation</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Each run compares provider records against recorded invoice payments for a period
            (FIN-08, D-085) and is stored: unapplied provider money, amount mismatches and
            provider payments the provider never sent are listed until resolved. A different
            authorised user closes a run than opened it.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/finance/provider-payments">
            Provider payments
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
          <ReconciliationActions companyId={company.id} />
          <section className="mt-8" aria-label="Open reconciliation runs">
            <h2 className="text-lg font-semibold text-slate-950">Open runs ({open.length})</h2>
            {open.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No open reconciliation runs.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {open.map((run) => (
                  <li key={run.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <p className="text-sm text-slate-900">
                      <strong>{run.reference}</strong> · {run.periodStart} → {run.periodEnd} ·{' '}
                      {run.summary.reconciles
                        ? <span className="text-emerald-700">reconciles</span>
                        : <span className="text-red-700">{run.summary.discrepancies.unappliedProviderEvents.length + run.summary.discrepancies.amountMismatches.length + run.summary.discrepancies.unknownProviderPayments.length} discrepancy item(s)</span>}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Provider applied {cedis(run.summary.providerAppliedPesewas)} ({run.summary.providerAppliedCount}) ·
                      received awaiting application {cedis(run.summary.providerReceivedPesewas)} ({run.summary.providerReceivedCount}) ·
                      recorded payments {cedis(run.summary.recordedPaymentsPesewas)} ({run.summary.recordedPaymentsCount})
                    </p>
                    {run.summary.discrepancies.unappliedProviderEvents.length > 0 ? (
                      <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
                        {run.summary.discrepancies.unappliedProviderEvents.map((item) => (
                          <li key={item.eventId}>Unapplied: {item.providerReference} ({cedis(item.amountPesewas ?? 0)})</li>
                        ))}
                      </ul>
                    ) : null}
                    <ReconciliationActions companyId={company.id} closeReconciliationId={run.id} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mt-10" aria-label="Closed reconciliation runs">
            <h2 className="text-lg font-semibold text-slate-950">Closed runs ({closed.length})</h2>
            {closed.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No closed reconciliation runs yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {closed.map((run) => (
                  <li key={run.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <p className="text-sm text-slate-900">
                      <strong>{run.reference}</strong> · {run.periodStart} → {run.periodEnd} ·{' '}
                      {run.summary.reconciles ? 'reconciled at close' : 'closed with discrepancies recorded'}
                    </p>
                    <ul className="mt-2 space-y-1 border-l border-slate-200 pl-3 text-sm text-slate-600">
                      {run.statusHistory.map((event) => (
                        <li key={event.sequence}>
                          {event.fromStatus ?? '—'} → {event.toStatus} by {event.actorName} — {event.reason}
                        </li>
                      ))}
                    </ul>
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
