import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  createOwnRentalRequest,
  RentalPortalNotLinkedError,
  RentalPortalValidationError,
} from '@/modules/rental-portal/portal';
import { RentalRequestMissingSubmissionFieldsError } from '@/modules/rentals/rental-requests';

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
  if (error instanceof RentalPortalValidationError) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
  }
  if (error instanceof RentalRequestMissingSubmissionFieldsError) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
  }
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'You do not have access to do that.' }, { status: 403 });
  }
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' }, { status: 500 });
}

/**
 * RNT-09 (D-066): create a Draft rental enquiry for the linked customer, or
 * mutate one of their requests. `action` is part of the URL for submit and
 * withdraw; the plain route creates.
 */
export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Sign in to continue.' }, { status: 401 });
  }
  try {
    const { companyId } = await context.params;
    const body = await request.json().catch(() => null);
    const record = await createOwnRentalRequest(body, session.user.id, companyId);
    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

