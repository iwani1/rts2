import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  InvalidTripCursorError,
  TripCompanyNotFoundError,
  TripValidationError,
  createTrip,
  listTrips,
} from '@/modules/trips/trips';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof TripCompanyNotFoundError) return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof TripValidationError || error instanceof InvalidTripCursorError) return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected trips API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await listTrips({
      actorId: session.user.id,
      companyId,
      status: url.searchParams.get('status') ?? undefined,
      clientId: url.searchParams.get('clientId') ?? undefined,
      routeId: url.searchParams.get('routeId') ?? undefined,
      driverId: url.searchParams.get('driverId') ?? undefined,
      date: url.searchParams.get('date') ?? undefined,
      fromDate: url.searchParams.get('fromDate') ?? undefined,
      toDate: url.searchParams.get('toDate') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const trip = await createTrip(await request.json(), session.user.id, companyId);
    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
