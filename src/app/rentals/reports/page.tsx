import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { mayStartSession } from '@/modules/auth/policy';
import { getRentalRequestReport, RentalReportCompanyNotFoundError } from '@/modules/rentals/rental-reports';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';
import { RentalReport } from './rental-report';

export const dynamic = 'force-dynamic';

export default async function RentalReportsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { status: true } });
  if (!mayStartSession(user?.status)) redirect('/login');
  const companies = await prisma.company.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, take: 2, select: { id: true } });
  if (companies.length !== 1) return <main className="fleet-page"><section className="fleet-empty"><h1>Rental report unavailable</h1><p>Exactly one active operator company must be provisioned. No report data was loaded.</p><Link className="button-link" href="/">Back to workspace</Link></section></main>;
  try {
    const report = await getRentalRequestReport(session.user.id, companies[0].id);
    return <RentalReport report={report} />;
  } catch (error) {
    if (error instanceof PermissionDeniedError) redirect('/');
    if (error instanceof RentalReportCompanyNotFoundError) redirect('/');
    throw error;
  }
}
