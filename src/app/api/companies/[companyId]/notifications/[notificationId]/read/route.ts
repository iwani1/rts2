import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import {
  markNotificationRead,
  NotificationCompanyNotFoundError,
  NotificationNotFoundError,
} from '@/modules/notifications/notifications';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof NotificationCompanyNotFoundError || error instanceof NotificationNotFoundError) {
    return NextResponse.json({ error: 'NOT_FOUND', message: error.message }, { status: 404 });
  }
  console.error('Unexpected notification read API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

/** NTF-01 (D-068): mark one of the caller's own notifications read. */
export async function POST(request: Request, context: { params: Promise<{ companyId: string; notificationId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, notificationId } = await context.params;
    const result = await markNotificationRead({ userId: session.user.id, companyId, notificationId });
    return NextResponse.json({ data: result });
  } catch (error) {
    return apiError(error);
  }
}
