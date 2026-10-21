import { ZodError } from 'zod';
import { requireApiSession } from '@/modules/auth/api';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  WaitingListCompanyNotFoundError,
  WaitingListTripNotFoundError,
  getTripWaitingList,
} from '@/modules/dispatch/waiting-list';

function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return Response.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof WaitingListCompanyNotFoundError || error instanceof WaitingListTripNotFoundError) {
    return Response.json({ error: error.code, message: error.message }, { status: 404 });
  }
  console.error('Unexpected waiting list API error', error);
  return Response.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(_request: Request, context: { params: Promise<{ companyId: string; tripId: string }> }) {
  try {
    const session = await requireApiSession();
    const { companyId, tripId } = await context.params;
    return Response.json(await getTripWaitingList({ actorId: session.user.id, companyId, tripId }));
  } catch (error) {
    return apiError(error);
  }
}
