import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import {
  markAllNotificationsRead,
  NotificationCompanyNotFoundError,
} from '@/modules/notifications/notifications';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof NotificationCompanyNotFoundError) return NextResponse.json({ error: 'COMPANY_NOT_FOUND', message: error.message }, { status: 404 });
  console.error('Unexpected notification read-all API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

/** NTF-01 (D-068): mark the caller's whole inbox read. */
export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const result = await markAllNotificationsRead({ userId: session.user.id, companyId });
    return NextResponse.json({ data: result });
  } catch (error) {
    return apiError(error);
  }
}
