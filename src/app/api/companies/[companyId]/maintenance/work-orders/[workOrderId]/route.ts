import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { transitionWorkOrder, WorkOrderNotFoundError, WorkOrderPolicyError } from '@/modules/maintenance/work-orders';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; workOrderId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, workOrderId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const result = await transitionWorkOrder({ ...body, actorId: session.user.id, companyId, workOrderId });
    return NextResponse.json({ workOrder: result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the transition, reason and any completion details.' }, { status: 400 });
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    if (error instanceof WorkOrderNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof WorkOrderPolicyError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: 'The work-order transition could not be completed.' }, { status: 500 });
  }
}
