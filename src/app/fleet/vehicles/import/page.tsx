import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { resolvePermission } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { VehicleImportManager } from '../vehicle-import-manager';

export const dynamic = 'force-dynamic';

export default async function VehicleImportPage() {
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
  const permission = await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'fleet:manage' });
  const canManage = permission.allowed && permission.scopes.some((scope) => ['GLOBAL', 'COMPANY'].includes(scope));
  if (!canManage) redirect('/fleet/vehicles');

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Vehicle import navigation">
        <Link href="/">Workspace</Link>
        <Link href="/fleet/vehicles">Vehicle register</Link>
        <span aria-current="page">Import vehicles</span>
      </nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{company.name}</p><h1>Import vehicles</h1><p className="muted">Preview and validate every vehicle row before adding records to the register.</p></div>
        <Link className="button-link" href="/fleet/vehicles">Back to vehicle register</Link>
      </div>
      <VehicleImportManager companyId={company.id} />
      <p className="fleet-limits">This vehicle import uses only the existing factual register fields. It does not set vehicle status, assign drivers, or upload photos/documents. Driver CSV import remains outstanding.</p>
    </div>
  </main>;
}
