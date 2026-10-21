import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  DispatchCompanyNotFoundError,
  DispatchValidationError,
  recordTripNoShow,
} from '@/modules/dispatch/dispatch';
import { TripNotFoundError } from '@/modules/trips/trips';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof DispatchCompanyNotFoundError || error instanceof TripNotFoundError) return NextResponse.json({ error: (error as { code?: string }).code ?? 'NOT_FOUND', message: error.message }, { status: 404 });
  if (error instanceof DispatchValidationError) return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected trip no-show API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string; tripId: string }> }) {
  try {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, tripId } = await context.params;
    return NextResponse.json(await recordTripNoShow(await request.json(), session.user.id, companyId, tripId));
  } catch (error) {
    return apiError(error);
  }
}
