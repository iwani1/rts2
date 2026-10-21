import { ZodError } from 'zod';
import { requireApiSession } from '@/modules/auth/api';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  DriverCompanyNotFoundError,
  DriverEventConflictError,
  DriverNotLinkedError,
  DriverTripNotFoundError,
  DriverValidationError,
  postDriverEvent,
} from '@/modules/driver/driver';

function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return Response.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof DriverNotLinkedError) return Response.json({ error: error.code, message: error.message }, { status: 403 });
  if (error instanceof DriverCompanyNotFoundError || error instanceof DriverTripNotFoundError) return Response.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof DriverEventConflictError) return Response.json({ error: error.code, message: error.message }, { status: 409 });
  if (error instanceof DriverValidationError) return Response.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected driver event API error', error);
  return Response.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string; tripId: string }> }) {
  try {
    const session = await requireApiSession();
    const { companyId, tripId } = await context.params;
    const result = await postDriverEvent(await request.json(), session.user.id, companyId, tripId);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
