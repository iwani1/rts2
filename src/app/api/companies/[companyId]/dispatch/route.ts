import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  DispatchCompanyNotFoundError,
  DispatchValidationError,
  getDispatchBoard,
} from '@/modules/dispatch/dispatch';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof DispatchCompanyNotFoundError) return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof DispatchValidationError) return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected dispatch board API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const date = new URL(request.url).searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
    return NextResponse.json(await getDispatchBoard({ actorId: session.user.id, companyId, date }));
  } catch (error) {
    return apiError(error);
  }
}
