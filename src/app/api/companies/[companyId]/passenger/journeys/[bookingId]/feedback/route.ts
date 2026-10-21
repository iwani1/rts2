import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  PassengerBookingNotFoundError,
  PassengerCompanyNotFoundError,
  PassengerNotLinkedError,
  PassengerPolicyError,
  submitPassengerFeedback,
} from '@/modules/passenger/passenger';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof PassengerNotLinkedError) return NextResponse.json({ error: error.code, message: error.message }, { status: 403 });
  if (error instanceof PassengerBookingNotFoundError) return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof PassengerCompanyNotFoundError) return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof PassengerPolicyError) return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
  console.error('Unexpected passenger feedback API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string; bookingId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, bookingId } = await context.params;
    const result = await submitPassengerFeedback(await request.json(), session.user.id, companyId, bookingId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
