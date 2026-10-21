import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  linkCustomerAccount,
  RentalPortalValidationError,
} from '@/modules/rental-portal/portal';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof RentalPortalValidationError) return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 422 });
  console.error('Unexpected customer link API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string; customerId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, customerId } = await context.params;
    const body = (await request.json().catch(() => null)) as { userId?: unknown; reason?: unknown } | null;
    const result = await linkCustomerAccount({
      actorId: session.user.id,
      companyId,
      customerId,
      userId: typeof body?.userId === 'string' ? body.userId : '',
      reason: typeof body?.reason === 'string' ? body.reason : '',
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return apiError(error);
  }
}
