import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  RentalCompanyNotFoundError,
  RentalRequestMissingSubmissionFieldsError,
  RentalRequestNotDraftError,
  RentalRequestNotFoundError,
  submitRentalRequest,
} from '@/modules/rentals/rental-requests';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; requestId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'A reason is required to submit this Draft.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof RentalCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  if (error instanceof RentalRequestNotFoundError) return NextResponse.json({ error: 'Rental request not found.' }, { status: 404 });
  if (error instanceof RentalRequestNotDraftError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof RentalRequestMissingSubmissionFieldsError) {
    return NextResponse.json({ error: error.message, missingFields: error.missingFields }, { status: 422 });
  }
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, requestId } = await context.params;
    const result = await submitRentalRequest(await request.json(), session.user.id, companyId, requestId);
    return NextResponse.json({ rentalRequest: result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
