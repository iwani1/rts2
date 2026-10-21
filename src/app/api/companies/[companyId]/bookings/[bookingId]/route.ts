import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  BookingCompanyNotFoundError,
  BookingNotFoundError,
  getBooking,
} from '@/modules/bookings/bookings';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; bookingId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const params = await context.params;
    const result = await getBooking({ actorId: session.user.id, ...params });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Check the booking reference.' }, { status: 400 });
    if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    if (error instanceof BookingCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    if (error instanceof BookingNotFoundError) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
  }
}
