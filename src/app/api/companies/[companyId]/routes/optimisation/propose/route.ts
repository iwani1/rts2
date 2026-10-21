import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import {
  OptimisationNotConfiguredError,
  getRouteOptimisationService,
  optimisationRequestSchema,
} from '@/modules/routes/optimisation-contract';

export const runtime = 'nodejs';

/**
 * RTE-05 / D-087: interface only. Requests are validated against the
 * published contract; until an optimisation service is configured the
 * endpoint refuses with 503 and no plan is invented.
 */
export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const access = await resolvePermission({ userId: session.user.id, companyId, permission: 'trip:dispatch' });
    if (!access.allowed) throw new PermissionDeniedError();
    const plan = await getRouteOptimisationService().proposePlan(
      optimisationRequestSchema.parse(await request.json()),
    );
    return NextResponse.json({ candidatePlan: plan });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
    if (error instanceof OptimisationNotConfiguredError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 503 });
    }
    console.error('Unexpected optimisation API error', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
  }
}
