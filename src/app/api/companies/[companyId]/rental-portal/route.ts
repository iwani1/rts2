import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  getRentalPortalHome,
  RentalPortalNotLinkedError,
} from '@/modules/rental-portal/portal';

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
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'You do not have access to do that.' }, { status: 403 });
  }
  console.error('Unexpected rental portal API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' }, { status: 500 });
}

/** RNT-09 (D-066): the linked customer's portal home. */
export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'Sign in to continue.' }, { status: 401 });
  }
  try {
    const { companyId } = await context.params;
    const home = await getRentalPortalHome({ actorId: session.user.id, companyId });
    return NextResponse.json({ data: home });
  } catch (error) {
    return apiError(error);
  }
}
