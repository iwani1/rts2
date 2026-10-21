import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/modules/auth/auth';
import { resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { getCorporateInvoice, listCorporateInvoices } from '@/modules/finance/invoices';
import { InvoiceManager } from './invoice-manager';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cedis(pesewas: number) {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
}

export default async function InvoicesPage({
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
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Expected exactly one active company before opening invoices.</p>
      </main>
    );
  }
  const company = companies[0];
  const permission = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'invoice:manage' });
  if (!permission.allowed) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
        <p className="text-sm text-red-700">Invoice access is not permitted for the signed-in user.</p>
      </main>
    );
  }
  const canManage = permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY');

  const clientId = firstParam(params.clientId);
  const cursor = firstParam(params.cursor);
  const selectedId = firstParam(params.invoice);
  const result = await listCorporateInvoices({
    actorId: session.user.id, companyId: company.id,
    clientId: clientId || undefined, cursor,
  });
  const selected = result.invoices.find((invoice) => invoice.id === selectedId) ?? result.invoices[0] ?? null;
  const detail = selected
    ? await getCorporateInvoice({ actorId: session.user.id, companyId: company.id, invoiceId: selected.id })
    : null;
  const [contracts] = await Promise.all([
    prisma.contract.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, reference: true, client: { select: { name: true } } },
      take: 200,
    }),
  ]);
  const returnTo = `/invoices?${new URLSearchParams({
    ...(selected ? { invoice: selected.id } : {}),
  }).toString()}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950">Corporate invoices</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Invoices are generated from Completed trips for one contract and period, priced only from the typed
            corporate-rate setting. Generating the same contract and period twice returns the original invoice;
            a trip can never be billed twice. Invoices are DRAFT and immutable until the finance lifecycle is
            approved.
          </p>
        </div>
        <Link className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700" href="/">
          Back to home
        </Link>
      </header>

      <section className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Subtotal</th>
              <th className="px-4 py-3 font-medium">Tax</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Open</th>
            </tr>
          </thead>
          <tbody>
            {result.invoices.map((invoice) => (
              <tr className="border-t border-slate-100" key={invoice.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{invoice.reference}</td>
                <td className="px-4 py-3 text-slate-700">{invoice.clientName}</td>
                <td className="px-4 py-3 text-slate-700">{invoice.periodStart} → {invoice.periodEnd}</td>
                <td className="px-4 py-3 text-slate-700">{invoice.status}</td>
                <td className="px-4 py-3 text-slate-700">{cedis(invoice.subtotalPesewas)}</td>
                <td className="px-4 py-3 text-slate-700">{cedis(invoice.taxPesewas)}</td>
                <td className="px-4 py-3 text-slate-700">{cedis(invoice.totalPesewas)}</td>
                <td className="px-4 py-3">
                  <Link className="font-medium text-slate-900 underline" href={`/invoices?${new URLSearchParams({ invoice: invoice.id }).toString()}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {result.invoices.length === 0 ? (
              <tr><td className="px-4 py-6 text-slate-600" colSpan={8}>No invoices yet. Generate one below.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {detail ? (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-950">Invoice {detail.invoice.reference}</h2>
          <dl className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-4">
            <div><dt className="font-medium text-slate-500">Contract</dt><dd>{detail.invoice.contractReference}</dd></div>
            <div><dt className="font-medium text-slate-500">Subtotal</dt><dd>{cedis(detail.invoice.subtotalPesewas)}</dd></div>
            <div><dt className="font-medium text-slate-500">Tax</dt><dd>{cedis(detail.invoice.taxPesewas)}</dd></div>
            <div><dt className="font-medium text-slate-500">Total</dt><dd>{cedis(detail.invoice.totalPesewas)}</dd></div>
          </dl>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr><th className="py-2 pr-4 font-medium">Description</th><th className="py-2 pr-4 font-medium">Unit</th><th className="py-2 pr-4 font-medium">Qty</th><th className="py-2 pr-4 font-medium">Rate</th><th className="py-2 font-medium">Amount</th></tr>
            </thead>
            <tbody>
              {detail.invoice.lines.map((line) => (
                <tr className="border-t border-slate-100" key={line.id}>
                  <td className="py-2 pr-4">{line.description}</td>
                  <td className="py-2 pr-4">{line.unit}</td>
                  <td className="py-2 pr-4">{line.quantity}</td>
                  <td className="py-2 pr-4">{cedis(line.ratePesewas)}</td>
                  <td className="py-2">{cedis(line.amountPesewas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <InvoiceManager
        canManage={canManage}
        companyId={company.id}
        contracts={contracts.map((contract) => ({ id: contract.id, label: `${contract.reference} — ${contract.client.name}` }))}
        returnTo={returnTo}
      />
    </main>
  );
}
