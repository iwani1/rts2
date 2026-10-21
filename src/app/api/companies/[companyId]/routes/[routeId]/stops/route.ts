import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { RouteLocationNotFoundError, RouteNotFoundError, setRouteStops } from '@/modules/routes/routes';
import { RouteCompanyNotFoundError } from '@/modules/routes/route-access';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; routeId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, routeId } = await context.params;
    const route = await setRouteStops(await request.json(), session.user.id, companyId, routeId);
    return NextResponse.json({ route }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the submitted stop order.' }, { status: 400 });
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    if (error instanceof RouteCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    if (error instanceof RouteNotFoundError) return NextResponse.json({ error: 'Route not found.' }, { status: 404 });
    if (error instanceof RouteLocationNotFoundError) return NextResponse.json({ error: 'Active location not found in this company.' }, { status: 400 });
    return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
  }
}
