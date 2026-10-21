import { ZodError } from 'zod';
import { requireApiSession } from '@/modules/auth/api';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  DriverCompanyNotFoundError,
  DriverNotLinkedError,
  DriverValidationError,
  listDriverTrips,
} from '@/modules/driver/driver';

function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return Response.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof DriverNotLinkedError) return Response.json({ error: error.code, message: error.message }, { status: 403 });
  if (error instanceof DriverCompanyNotFoundError) return Response.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof DriverValidationError) return Response.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected driver trips API error', error);
  return Response.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await requireApiSession();
    const { companyId } = await context.params;
    const date = new URL(request.url).searchParams.get('date') ?? undefined;
    return Response.json(await listDriverTrips({ actorId: session.user.id, companyId, date }));
  } catch (error) {
    return apiError(error);
  }
}
