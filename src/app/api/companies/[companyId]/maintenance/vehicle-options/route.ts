import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { listWorkOrderVehicleOptions, WorkOrderNotFoundError } from '@/modules/maintenance/work-orders';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const search = new URL(request.url).searchParams.get('q') ?? undefined;
    const options = await listWorkOrderVehicleOptions(session.user.id, companyId, search);
    return NextResponse.json(options, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Vehicle search must be at most 100 characters.' }, { status: 400 });
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    if (error instanceof WorkOrderNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    return NextResponse.json({ error: 'Vehicle options could not be loaded.' }, { status: 500 });
  }
}
