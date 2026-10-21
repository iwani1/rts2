import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { listRentalInvoices } from '@/modules/finance/rental-invoices';

export const dynamic = 'force-dynamic';

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

export default async function RentalInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
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
        <p className="text-sm text-red-700">Expected exactly one active company before opening rental invoices.</p>
      </main>
    );
  }
  const company = companies[0];
  const params = await searchParams;
  let content: React.ReactNode;
  try {
    const { invoices, nextCursor } = await listRentalInvoices(session.user.id, company.id, {
      status: params.status,
      cursor: params.cursor,
    });
    content = (
      <>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">Paid</th>
                <th className="py-2 pr-4">Outstanding</th>
                <th className="py-2 pr-4">Due</th>
                <th className="py-2">Rental</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b align-top">
                  <td className="py-2 pr-4 font-medium">{invoice.reference}</td>
                  <td className="py-2 pr-4">{invoice.status}</td>
                  <td className="py-2 pr-4">{cedis(invoice.totalPesewas)}</td>
                  <td className="py-2 pr-4">{cedis(invoice.paidPesewas)}</td>
                  <td className="py-2 pr-4">{cedis(invoice.outstandingPesewas)}</td>
                  <td className="py-2 pr-4">{invoice.dueDate ?? '—'}</td>
                  <td className="py-2">
                    <Link className="underline" href={`/rentals/requests?edit=${encodeURIComponent(invoice.requestId)}`}>Open rental</Link>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td className="py-3 text-slate-500" colSpan={7}>No rental invoices match. Invoices are created from approved rental completions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {nextCursor && (
          <p className="mt-4">
            <Link className="underline" href={`/finance/rental-invoices?cursor=${encodeURIComponent(nextCursor)}${params.status ? `&status=${params.status}` : ''}`}>Next page</Link>
          </p>
        )}
      </>
    );
  } catch {
    content = <p className="text-sm text-red-700">Rental invoices are available to staff with invoice access.</p>;
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Finance · {company.name}</p>
      <h1 className="mt-1 text-2xl font-semibold">Rental invoices</h1>
      <p className="mt-1 text-sm text-slate-600">
        Invoices raised from approved rental completions (D-090). Amounts are
        snapshot at creation; payments are append-only and settle an invoice
        to PAID when they cover its total.
      </p>
      <nav className="mt-4 flex gap-3 text-sm" aria-label="Filter by status">
        {['', 'DRAFT', 'ISSUED', 'PAID', 'VOID'].map((status) => (
          <Link
            key={status || 'ALL'}
            className={`underline ${(params.status ?? '') === status ? 'font-semibold' : ''}`}
            href={status ? `/finance/rental-invoices?status=${status}` : '/finance/rental-invoices'}
          >
            {status || 'All'}
          </Link>
        ))}
      </nav>
      <div className="mt-4">{content}</div>
    </main>
  );
}
