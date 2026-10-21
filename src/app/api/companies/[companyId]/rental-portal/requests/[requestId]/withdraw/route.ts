import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  RentalPortalNotLinkedError,
  RentalPortalPolicyError,
  RentalPortalRequestNotFoundError,
  withdrawOwnRentalRequest,
} from '@/modules/rental-portal/portal';
import {
  RentalRequestMissingSubmissionFieldsError,
  RentalRequestNotDraftError,
  RentalRequestNotFoundError,
} from '@/modules/rentals/rental-requests';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Check the highlighted fields and try again.', issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof RentalPortalNotLinkedError) {
    return NextResponse.json({ error: 'NOT_LINKED', message: error.message }, { status: 403 });
  }
  if (error instanceof RentalPortalRequestNotFoundError || error instanceof RentalRequestNotFoundError) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'That rental request was not found for your customer record.' }, { status: 404 });
  }
  if (error instanceof RentalPortalPolicyError) {
    return NextResponse.json({ error: 'POLICY', message: error.message }, { status: 400 });
  }
  if (error instanceof RentalRequestMissingSubmissionFieldsError || error instanceof RentalRequestNotDraftError) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
  }
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'You do not have access to do that.' }, { status: 403 });
  }
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' }, { status: 500 });
}

/** RNT-09 (D-066): withdraw the linked customer's own Draft or Submitted request. */
export async function POST(request: Request, context: { params: Promise<{ companyId: string; requestId: string }> }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Sign in to continue.' }, { status: 401 });
  }
  try {
    const { companyId, requestId } = await context.params;
    const body = await request.json().catch(() => null);
    const record = await withdrawOwnRentalRequest(body, session.user.id, companyId, requestId);
    return NextResponse.json({ data: record });
  } catch (error) {
    return apiError(error);
  }
}
