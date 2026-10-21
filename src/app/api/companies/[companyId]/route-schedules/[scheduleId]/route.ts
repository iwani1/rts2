import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  RouteScheduleConflictError,
  RouteScheduleNotFoundError,
  setRouteScheduleActive,
} from '@/modules/routes/route-schedules';
import { RouteCompanyNotFoundError } from '@/modules/routes/route-access';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; scheduleId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, scheduleId } = await context.params;
    const schedule = await setRouteScheduleActive(await request.json(), session.user.id, companyId, scheduleId);
    return NextResponse.json({ schedule }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the submitted schedule change.' }, { status: 400 });
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    if (error instanceof RouteCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    if (error instanceof RouteScheduleNotFoundError) return NextResponse.json({ error: 'Route schedule not found.' }, { status: 404 });
    if (error instanceof RouteScheduleConflictError) return NextResponse.json({ error: error.message, conflicts: error.conflicts }, { status: 409 });
    return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
  }
}
