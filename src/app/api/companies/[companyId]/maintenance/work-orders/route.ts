import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { createWorkOrder, listWorkOrders, WorkOrderNotFoundError, WorkOrderPolicyError } from '@/modules/maintenance/work-orders';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

function respondError(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the fault report, date, odometer, safety confirmation and reason.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof WorkOrderNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof WorkOrderPolicyError) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ error: 'The work-order request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const workOrders = await listWorkOrders(session.user.id, companyId);
    return NextResponse.json({ workOrders }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return respondError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const workOrder = await createWorkOrder({ ...body, actorId: session.user.id, companyId });
    return NextResponse.json({ workOrder }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return respondError(error);
  }
}
