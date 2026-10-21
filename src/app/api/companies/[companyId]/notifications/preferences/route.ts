import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import {
  getOwnPreferences,
  NotificationCompanyNotFoundError,
  updateOwnPreferences,
} from '@/modules/notifications/notifications';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof NotificationCompanyNotFoundError) return NextResponse.json({ error: 'COMPANY_NOT_FOUND', message: error.message }, { status: 404 });
  console.error('Unexpected notification preferences API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

/** NTF-01 (D-068): the caller's own channel preferences. */
export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const preferences = await getOwnPreferences({ userId: session.user.id, companyId });
    return NextResponse.json({ data: preferences });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const body = await request.json().catch(() => null);
    const preferences = await updateOwnPreferences(body, session.user.id, companyId);
    return NextResponse.json({ data: preferences });
  } catch (error) {
    return apiError(error);
  }
}
