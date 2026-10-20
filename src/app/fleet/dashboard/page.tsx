import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { FleetCompanyNotFoundError, getVehicleRegisterSummary } from '@/modules/fleet/vehicles';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';

export const dynamic = 'force-dynamic';

export default async function FleetDashboardPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({
    where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true },
  });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty">
    <h1>Fleet overview unavailable</h1>
    <p>Exactly one active operator company must be provisioned for this installation. No fleet data was loaded.</p>
    <Link className="button-link" href="/">Back to workspace</Link>
  </section></main>;

  let summary: Awaited<ReturnType<typeof getVehicleRegisterSummary>>;
  try {
    summary = await getVehicleRegisterSummary({ actorId: session.user.id, companyId: companies[0].id });
  } catch (error) {
    if (error instanceof FleetCompanyNotFoundError) notFound();
    if (error instanceof PermissionDeniedError) redirect('/');
    throw error;
  }

  return <main className="fleet-page">
    <header className="fleet-page-header">
      <Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav aria-label="Fleet navigation"><Link href="/">Workspace</Link><Link href="/fleet/vehicles">Vehicle register</Link><span aria-current="page">Fleet overview</span></nav>
    </header>
    <div className="fleet-content">
      <div className="fleet-title-row">
        <div><p className="eyebrow">{companies[0].name}</p><h1>Fleet overview</h1><p className="muted">A factual summary of non-archived vehicle records. It does not represent operational availability.</p></div>
        <div className="fleet-title-actions"><Link className="button-link" href="/fleet/vehicles">Vehicle register</Link></div>
      </div>
      <section className="fleet-summary-grid" aria-label="Registered vehicle total">
        <article className="fleet-summary-card">
          <h2>Vehicles in register</h2>
          <p className="fleet-summary-value">{summary.registeredVehicleCount}</p>
          <p className="muted">Non-archived vehicle records</p>
        </article>
      </section>
      <section className="fleet-list-panel" aria-labelledby="vehicle-category-summary-title">
        <div className="fleet-list-heading"><div><h2 id="vehicle-category-summary-title">Records by supplied category</h2><p className="muted">Category labels are shown exactly as recorded; no category presets are applied.</p></div></div>
        {summary.byCategory.length === 0 ? <div className="fleet-empty"><h3>No vehicle records</h3><p>No non-archived vehicle records are available for this company.</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Vehicle counts by category" tabIndex={0}>
          <table className="vehicle-table">
            <caption className="sr-only">Non-archived vehicle record counts by supplied category</caption>
            <thead><tr><th scope="col">Recorded category</th><th scope="col">Vehicles</th></tr></thead>
            <tbody>{summary.byCategory.map(({ category, count }) => <tr key={category}><td>{category}</td><td>{count}</td></tr>)}</tbody>
          </table>
        </div>}
      </section>
      <p className="fleet-limits">Availability, assignments, trips, maintenance, document-expiry classifications, utilisation and downtime are not summarized because their authoritative workflows or policies are not implemented.</p>
    </div>
  </main>;
}
