import { NextResponse } from 'next/server';
import { isActiveSuperAdmin } from '@/modules/auth/permissions';
import { CompanyNotFoundError, getCompanyResourceBuffers } from '@/modules/settings/registry';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!await isActiveSuperAdmin(session.user.id)) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  try {
    const { companyId } = await context.params;
    const buffers = await getCompanyResourceBuffers(companyId);
    return NextResponse.json(buffers, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof CompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
  }
}
