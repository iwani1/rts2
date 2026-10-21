import { ZodError } from 'zod';
import { requireApiSession } from '@/modules/auth/api';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  TripCompanyNotFoundError,
  TripNotFoundError,
  TripPolicyError,
  TripTransitionNotAllowedError,
  TripValidationError,
  transitionTrip,
} from '@/modules/trips/trips';

function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return Response.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof TripCompanyNotFoundError || error instanceof TripNotFoundError) return Response.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof TripValidationError || error instanceof TripPolicyError || error instanceof TripTransitionNotAllowedError) {
    return Response.json({ error: error.code, message: error.message, fromStatus: 'fromStatus' in error ? error.fromStatus : undefined, toStatus: 'toStatus' in error ? error.toStatus : undefined }, { status: 409 });
  }
  console.error('Unexpected trip transition API error', error);
  return Response.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string; tripId: string }> }) {
  try {
    const session = await requireApiSession();
    const { companyId, tripId } = await context.params;
    const trip = await transitionTrip(await request.json(), session.user.id, companyId, tripId);
    return Response.json({ trip });
  } catch (error) {
    return apiError(error);
  }
}
