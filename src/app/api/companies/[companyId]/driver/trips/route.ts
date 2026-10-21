import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  DriverCompanyNotFoundError,
  DriverNotLinkedError,
  DriverValidationError,
  listDriverTrips,
} from '@/modules/driver/driver';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof DriverNotLinkedError) return NextResponse.json({ error: error.code, message: error.message }, { status: 403 });
  if (error instanceof DriverCompanyNotFoundError) return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof DriverValidationError) return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected driver trips API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const date = new URL(request.url).searchParams.get('date') ?? undefined;
    return NextResponse.json(await listDriverTrips({ actorId: session.user.id, companyId, date }));
  } catch (error) {
    return apiError(error);
  }
}
