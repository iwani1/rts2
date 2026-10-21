import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  RouteScheduleConflictError,
  createRouteSchedule,
  listRouteSchedules,
} from '@/modules/routes/route-schedules';
import { RouteNotFoundError } from '@/modules/routes/routes';
import { RouteCompanyNotFoundError } from '@/modules/routes/route-access';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; routeId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the submitted schedule details.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof RouteCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  if (error instanceof RouteNotFoundError) return NextResponse.json({ error: 'Route not found.' }, { status: 404 });
  if (error instanceof RouteScheduleConflictError) return NextResponse.json({ error: error.message, conflicts: error.conflicts }, { status: 409 });
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, routeId } = await context.params;
    const result = await listRouteSchedules({ actorId: session.user.id, companyId, routeId });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, routeId } = await context.params;
    const schedule = await createRouteSchedule(await request.json(), session.user.id, companyId, routeId);
    return NextResponse.json({ schedule }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
