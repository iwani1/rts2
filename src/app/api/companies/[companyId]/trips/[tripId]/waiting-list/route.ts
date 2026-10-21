import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  WaitingListCompanyNotFoundError,
  WaitingListTripNotFoundError,
  getTripWaitingList,
} from '@/modules/dispatch/waiting-list';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof WaitingListCompanyNotFoundError || error instanceof WaitingListTripNotFoundError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  }
  console.error('Unexpected waiting list API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string; tripId: string }> }) {
  try {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, tripId } = await context.params;
    return NextResponse.json(await getTripWaitingList({ actorId: session.user.id, companyId, tripId }));
  } catch (error) {
    return apiError(error);
  }
}
