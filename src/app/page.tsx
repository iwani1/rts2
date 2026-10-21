import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isActiveSuperAdmin, resolvePermission } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { LogoutButton } from './logout-button';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const currentUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(currentUser?.status)) redirect('/login');
  const auditAccess = await resolvePermission({ userId: session.user.id, permission: 'audit:read' });
  const canManageUserRoles = await isActiveSuperAdmin(session.user.id);
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true } });
  const company = companies.length === 1 ? companies[0] : undefined;
  const fleetAccess = company ? await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'fleet:manage' }) : { allowed: false, scopes: [] };
  const driverAccess = company ? await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'driver:manage' }) : { allowed: false, scopes: [] };
  const customerAccess = company ? await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'customer:manage' }) : { allowed: false, scopes: [] };
  const clientAccess = company ? await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'client:manage' }) : { allowed: false, scopes: [] };
  const employeeAccess = company ? await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'employee:manage' }) : { allowed: false, scopes: [] };
  const rentalAccess = company ? await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'rental:manage' }) : { allowed: false, scopes: [] };
  const maintenanceAccess = company ? await resolvePermission({ userId: session.user.id, companyId: company.id, permission: 'maintenance:manage' }) : { allowed: false, scopes: [] };
  const canManageMaintenance = maintenanceAccess.allowed && maintenanceAccess.scopes.some((scope) => ['GLOBAL', 'COMPANY', 'APPROVE_RELEASE'].includes(scope));
  const canManageRentalRequests = rentalAccess.allowed && rentalAccess.scopes.some((scope) => ['GLOBAL', 'COMPANY'].includes(scope));
  const canReadDriverRegister = driverAccess.allowed && driverAccess.scopes.some((scope) => ['GLOBAL', 'COMPANY'].includes(scope));
  const canManageCustomers = customerAccess.allowed && customerAccess.scopes.some((scope) => ['GLOBAL', 'COMPANY'].includes(scope));
  const canManageClients = clientAccess.allowed && clientAccess.scopes.some((scope) => ['GLOBAL', 'COMPANY'].includes(scope));
  const canManageEmployees = employeeAccess.allowed && employeeAccess.scopes.some((scope) => ['GLOBAL', 'COMPANY'].includes(scope));
  return <main className="app-shell">
    <header className="app-header">
      <Link className="wordmark" href="/" aria-label="Richie TMS home">R<span>.</span>TS</Link>
      <nav className="account-area" aria-label="Account">
        {canManageUserRoles && <Link className="header-link" href="/admin/users">User roles</Link>}
        {canManageUserRoles && <Link className="header-link" href="/admin/settings">Policy settings</Link>}
        {auditAccess.scopes.includes('GLOBAL') && <Link className="header-link" href="/admin/audit">Audit activity</Link>}
        {fleetAccess.allowed && <Link className="header-link" href="/fleet/vehicles">Vehicle register</Link>}
        {canReadDriverRegister && <Link className="header-link" href="/fleet/drivers">Driver register</Link>}
        {canManageMaintenance && <Link className="header-link" href="/fleet/maintenance">Maintenance</Link>}
        {canManageCustomers && <Link className="header-link" href="/customers">Customer register</Link>}
        {canManageClients && <Link className="header-link" href="/clients">Corporate clients</Link>}
        {canManageClients && <Link className="header-link" href="/contracts">Contracts</Link>}
        {canManageEmployees && <Link className="header-link" href="/employees">Employees</Link>}
        {canManageRentalRequests && <Link className="header-link" href="/rentals/requests">Rental requests</Link>}
        {canManageRentalRequests && <Link className="header-link" href="/rentals/reports">Rental reports</Link>}
        <Link className="header-link" href="/account/profile">My profile</Link>
        <Link className="header-link" href="/account/security">Change password</Link>
        <span>{session.user.name || session.user.email}</span>
        <LogoutButton />
      </nav>
    </header>
    <section className="welcome-panel">
      <p className="eyebrow">Operations workspace</p>
      <h1>Welcome, {session.user.name || 'team member'}</h1>
      <p>Your account is authenticated. Use the available registers to maintain verified company records.</p>
      <p className="notice">Phase 1B is in progress. Vehicle, driver, customer and corporate client registers, rental Draft entry and submission, and the contract register are available. Employees, routes, bookings, dispatch, driver trip actions and corporate invoicing are not yet available.</p>
      {companies.length !== 1 && <p className="notice" role="status">Company-specific registers are hidden until exactly one active operator company is configured.</p>}
    </section>
  </main>;
}
