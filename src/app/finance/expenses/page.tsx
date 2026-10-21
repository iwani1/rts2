import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { listExpenses } from '@/modules/finance/expenses';
import ExpenseActions from './ExpenseActions';

export const dynamic = 'force-dynamic';

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

const CATEGORIES = ['FUEL', 'MAINTENANCE', 'REPAIRS', 'TYRES', 'TOLLS', 'OTHER'] as const;

export default async function ExpensesPage() {
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
        <p className="text-sm text-red-700">Expected exactly one active company before opening expenses.</p>
      </main>
    );
  }
  const company = companies[0];

  const vehicles = await prisma.vehicle.findMany({
    where: { companyId: company.id, archivedAt: null },
    orderBy: { registrationNumber: 'asc' },
    select: { id: true, registrationNumber: true },
  });

  let expenseRows: Awaited<ReturnType<typeof listExpenses>>['expenses'] = [];
  let loadError: string | null = null;
  try {
    expenseRows = (await listExpenses({
      actorId: session.user.id, companyId: company.id, limit: 100,
    })).expenses;
  } catch (error) {
    if (error instanceof PermissionDeniedError) loadError = 'Expense access is not permitted for the signed-in user.';
    else throw error;
  }

  const pending = expenseRows.filter((expense) => expense.status === 'Pending');
  const decided = expenseRows.filter((expense) => expense.status !== 'Pending');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Expenses</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Operational expenses are recorded as Pending and take effect only after a different
            authorised user approves them (D-081). Rejected and approved records are final;
            corrections are made with a compensating record.
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
          <ExpenseActions companyId={company.id} categories={[...CATEGORIES]} vehicles={vehicles} />
          <section className="mt-8" aria-label="Awaiting decision">
            <h2 className="text-lg font-semibold text-slate-950">Awaiting decision ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No expenses are awaiting a decision.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {pending.map((expense) => (
                  <li key={expense.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <p className="text-sm text-slate-900">
                      <strong>{expense.reference}</strong> · {expense.category} · {cedis(expense.amountPesewas)} · {expense.expenseDate}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{expense.description}</p>
                    <ExpenseActions companyId={company.id} decideExpense={expense} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="mt-10" aria-label="Decided expenses">
            <h2 className="text-lg font-semibold text-slate-950">Decided ({decided.length})</h2>
            {decided.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Nothing has been approved or rejected yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {decided.map((expense) => (
                  <li key={expense.id} className="rounded-lg border border-slate-200 px-4 py-3">
                    <p className="text-sm text-slate-900">
                      <strong>{expense.reference}</strong> · {expense.category} · {cedis(expense.amountPesewas)} · {expense.status}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{expense.description}</p>
                    <ul className="mt-2 space-y-1 border-l border-slate-200 pl-3 text-sm text-slate-600">
                      {expense.statusHistory.map((event) => (
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
