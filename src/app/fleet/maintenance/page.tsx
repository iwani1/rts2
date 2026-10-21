import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { ZodError } from 'zod';
import { InvalidWorkOrderCursorError, listWorkOrders, listWorkOrderVehicleOptions, WorkOrderNotFoundError } from '@/modules/maintenance/work-orders';
import { mayStartSession } from '@/modules/auth/policy';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { WorkOrderManager } from './work-order-manager';

export const dynamic = 'force-dynamic';
type PageProps = { searchParams: Promise<{ status?: string; q?: string; cursor?: string; cursorHistory?: string }> };

export default async function MaintenancePage({ searchParams }: PageProps) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Maintenance unavailable</h1><p>Exactly one active operator company must be provisioned. No maintenance data was loaded.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;

  const company = companies[0];
  const params = await searchParams;
  const cursorHistory = params.cursorHistory ? params.cursorHistory.split('.') : [];
  if (cursorHistory.length > 50 || cursorHistory.some((token) => token !== 'ROOT' && !/^[A-Za-z0-9_-]{1,128}$/.test(token))) {
    redirect('/fleet/maintenance');
  }
  try {
    const [workOrderPage, vehicleOptions] = await Promise.all([
      listWorkOrders(session.user.id, company.id, params.status, params.q, params.cursor),
      listWorkOrderVehicleOptions(session.user.id, company.id),
    ]);
    return <main className="fleet-page">
      <header className="fleet-page-header"><Link className="wordmark fleet-wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link><nav aria-label="Maintenance navigation"><Link href="/">Workspace</Link><Link href="/fleet/vehicles">Vehicle register</Link><span aria-current="page">Maintenance</span></nav></header>
      <div className="fleet-content">
        <div className="fleet-title-row"><div><p className="eyebrow">{company.name}</p><h1>Maintenance work orders</h1><p className="muted">Report and track non-safety maintenance faults.</p></div><div className="fleet-title-actions"><Link className="button-link" href="/fleet/maintenance/analytics">Cost analytics</Link><Link className="button-link" href="/fleet/maintenance/service-plans">Service reminders</Link><Link className="button-link" href="/fleet/vehicles">Vehicle register</Link><Link className="button-link" href="/">Back to workspace</Link></div></div>
        <WorkOrderManager companyId={company.id} vehicles={vehicleOptions.vehicles} vehiclesHaveMore={vehicleOptions.hasMore} initialWorkOrders={workOrderPage.workOrders} statusFilter={params.status} searchQuery={params.q} pageCursor={params.cursor} cursorHistory={cursorHistory} nextCursor={workOrderPage.nextCursor} />
        <p className="fleet-limits">The reason-audited work-order lifecycle records planned work, optional costs and manager-supplied completion inspection evidence. It does not assign technicians, independently verify inspection, or link work orders to safety-block release. Safety blocks remain separately managed from the vehicle register; assignment prevention is inactive until an assignment workflow exists.</p>
      </div>
    </main>;
  } catch (error) {
    if (error instanceof PermissionDeniedError) redirect('/');
    if (error instanceof InvalidWorkOrderCursorError) redirect('/fleet/maintenance');
    if (error instanceof WorkOrderNotFoundError) redirect('/');
    if (error instanceof ZodError) redirect('/fleet/maintenance');
    throw error;
  }
}
