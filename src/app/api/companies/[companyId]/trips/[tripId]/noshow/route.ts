import { ZodError } from 'zod';
import { requireApiSession } from '@/modules/auth/api';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  DispatchCompanyNotFoundError,
  DispatchValidationError,
  recordTripNoShow,
} from '@/modules/dispatch/dispatch';
import { TripNotFoundError } from '@/modules/trips/trips';

function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return Response.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof DispatchCompanyNotFoundError || error instanceof TripNotFoundError) return Response.json({ error: (error as { code?: string }).code ?? 'NOT_FOUND', message: error.message }, { status: 404 });
  if (error instanceof DispatchValidationError) return Response.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected trip no-show API error', error);
  return Response.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string; tripId: string }> }) {
  try {
    const session = await requireApiSession();
    const { companyId, tripId } = await context.params;
    return Response.json(await recordTripNoShow(await request.json(), session.user.id, companyId, tripId));
  } catch (error) {
    return apiError(error);
  }
}
