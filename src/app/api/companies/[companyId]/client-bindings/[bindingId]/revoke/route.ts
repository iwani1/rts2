import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  DashboardCompanyNotFoundError,
  DashboardValidationError,
  revokeUserClientBinding,
} from '@/modules/clients/dashboard';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof DashboardCompanyNotFoundError) return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof DashboardValidationError) return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected client binding revoke API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string; bindingId: string }> }) {
  try {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, bindingId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const result = await revokeUserClientBinding({
      actorId: session.user.id,
      companyId,
      bindingId,
      reason: typeof body.reason === 'string' ? body.reason : '',
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
