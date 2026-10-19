import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { resolvePermission } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { CustomerImportManager } from '../customer-import-manager';

export const dynamic = 'force-dynamic';

export default async function CustomerImportPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({
    where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true },
  });
  if (companies.length !== 1) notFound();
  const company = companies[0];
  const permission = await resolvePermission({
    userId: session.user.id, companyId: company.id, permission: 'customer:manage',
  });
  const canManage = permission.allowed && permission.scopes.some((scope) => ['GLOBAL', 'COMPANY'].includes(scope));
  if (!canManage) redirect('/customers');

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Customer import navigation">
        <Link href="/">Workspace</Link>
        <Link href="/customers">Customer register</Link>
        <span aria-current="page">Import customers</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Import customers</h1><p className="muted">Review every row before adding customer records to the register.</p></div>
        <Link className="button-link" href="/customers">Back to customer register</Link>
      </div>
      <CustomerImportManager companyId={company.id} />
      <p className="fleet-limits">This first import slice covers customers only. Vehicle and driver CSV imports remain unimplemented. Invalid files are never partially imported; existing records are never overwritten or merged.</p>
    </div>
  </main>;
}
