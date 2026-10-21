import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  BookingCompanyNotFoundError,
  BookingNotFoundError,
  BookingPolicyError,
  BookingTransitionNotAllowedError,
  transitionBooking,
} from '@/modules/bookings/bookings';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; bookingId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, bookingId } = await context.params;
    const booking = await transitionBooking(await request.json(), session.user.id, companyId, bookingId);
    return NextResponse.json({ booking }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the submitted booking transition.' }, { status: 400 });
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    if (error instanceof BookingCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    if (error instanceof BookingNotFoundError) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    if (error instanceof BookingTransitionNotAllowedError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof BookingPolicyError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
  }
}
