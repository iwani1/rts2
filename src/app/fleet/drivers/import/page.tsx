import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { resolvePermission } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { DriverImportManager } from '../driver-import-manager';

export const dynamic = 'force-dynamic';

export default async function DriverImportPage() {
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
  const permission = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'driver:manage' });
  const canManage = permission.allowed && permission.scopes.some((scope) => ['GLOBAL', 'COMPANY'].includes(scope));
  if (!canManage) redirect('/fleet/drivers');

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Driver import navigation">
        <Link href="/">Workspace</Link>
        <Link href="/fleet/drivers">Driver register</Link>
        <span aria-current="page">Import drivers</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Import drivers</h1><p className="muted">Preview every row before adding driver records to the register.</p></div>
        <Link className="button-link" href="/fleet/drivers">Back to driver register</Link>
      </div>
      <DriverImportManager companyId={company.id} />
      <p className="fleet-limits">The import creates one new record per valid row. The driver register has no approved unique import identifier, so matching names are not merged or treated as duplicates. Review your source list before importing. No driver contact details or account links are included.</p>
    </div>
  </main>;
}
