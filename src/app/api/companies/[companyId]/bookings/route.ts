import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  BookingCompanyNotFoundError,
  BookingDuplicateError,
  BookingPolicyError,
  BookingValidationError,
  InvalidBookingCursorError,
  createBooking,
  listBookings,
} from '@/modules/bookings/bookings';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the submitted booking details.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof BookingCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  if (error instanceof BookingValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof BookingPolicyError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof BookingDuplicateError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof InvalidBookingCursorError) return NextResponse.json({ error: 'Invalid booking page cursor.' }, { status: 400 });
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await listBookings({
      actorId: session.user.id, companyId,
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      bookingType: url.searchParams.get('bookingType') ?? undefined,
      clientId: url.searchParams.get('clientId') ?? undefined,
      employeeId: url.searchParams.get('employeeId') ?? undefined,
      journeyDate: url.searchParams.get('date') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const booking = await createBooking(await request.json(), session.user.id, companyId);
    return NextResponse.json({ booking }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
