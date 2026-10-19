import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  getRentalRequest,
  RentalCompanyNotFoundError,
  RentalCustomerNotFoundError,
  RentalRequestNotDraftError,
  RentalRequestNotFoundError,
  updateRentalRequestDraft,
} from '@/modules/rentals/rental-requests';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; requestId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check the rental request details.' }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  if (error instanceof RentalCompanyNotFoundError) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  if (error instanceof RentalCustomerNotFoundError) return NextResponse.json({ error: 'Select an active customer in this company.' }, { status: 400 });
  if (error instanceof RentalRequestNotFoundError) return NextResponse.json({ error: 'Rental request not found.' }, { status: 404 });
  if (error instanceof RentalRequestNotDraftError) return NextResponse.json({ error: 'Only a Draft request may be edited.' }, { status: 409 });
  return NextResponse.json({ error: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const params = await context.params;
    const result = await getRentalRequest({ actorId: session.user.id, ...params });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, requestId } = await context.params;
    const rentalRequest = await updateRentalRequestDraft(await request.json(), session.user.id, companyId, requestId);
    return NextResponse.json({ rentalRequest }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
