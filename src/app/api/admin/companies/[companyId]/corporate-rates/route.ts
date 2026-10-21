import { NextResponse } from 'next/server';
import { isActiveSuperAdmin } from '@/modules/auth/permissions';
import { CompanyNotFoundError, getCompanyCorporateRates } from '@/modules/settings/registry';
import { getAuth } from '@/server/auth';
import { getPrisma } from '@/server/prisma';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!await isActiveSuperAdmin(session.user.id)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  try {
    const { companyId } = await context.params;
    const rates = await getCompanyCorporateRates(companyId);
    const contractRows = await getPrisma().contract.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, serviceType: true, status: true, client: { select: { name: true } } },
    });
    const contracts = contractRows.map((contract) => ({
      id: contract.id,
      label: `${contract.client.name} — ${contract.serviceType} (${contract.status})`,
    }));
    return NextResponse.json({ rates, contracts }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof CompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
  }
}
