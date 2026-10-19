import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isActiveSuperAdmin } from '@/modules/auth/permissions';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { LogoutButton } from '@/app/logout-button';
import { SettingsRegistryStatus } from './settings-registry-status';
import { ResourceBuffersEditor } from './resource-buffers-editor';
import { QuoteValidityEditor } from './quote-validity-editor';
import { PricingModelsEditor } from './pricing-models-editor';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  if (!await isActiveSuperAdmin(session.user.id)) redirect('/');
  const companies = await getPrisma().company.findMany({
    where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true },
  });

  return <main className="app-shell">
    <header className="app-header">
      <Link className="wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav className="account-area" aria-label="Administration navigation">
        <Link className="header-link" href="/">Workspace</Link>
        <Link className="header-link" href="/admin/users">User roles</Link>
        <Link className="header-link" href="/admin/audit">Audit activity</Link>
        <span>{session.user.name || session.user.email}</span>
        <LogoutButton />
      </nav>
    </header>
    <section className="audit-content" aria-labelledby="settings-status-title">
      <div className="audit-heading"><div>
        <p className="eyebrow">Administration</p>
        <h1 id="settings-status-title">Policy settings status</h1>
        <p className="muted">Review which required policies are configured and which features they block. Values are not displayed here.</p>
      </div></div>
      <p className="fleet-limits">General policy values remain read-only here. Typed RNT-03 turnaround buffers and RNT-04 pricing models and quotation validity have dedicated editors; each requires explicit operator-entered values and an audit reason, with no business values prefilled.</p>
      {companies.length !== 1
        ? <div className="audit-empty" role="status"><h2>Settings status unavailable</h2><p>Exactly one active operator company is required for this installation. No company was selected automatically.</p></div>
        : <><SettingsRegistryStatus companyId={companies[0].id} companyName={companies[0].name} /><QuoteValidityEditor companyId={companies[0].id} /><PricingModelsEditor companyId={companies[0].id} /><ResourceBuffersEditor companyId={companies[0].id} /></>}
    </section>
  </main>;
}
