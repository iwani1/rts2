import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  ReconciliationCompanyNotFoundError,
  ReconciliationNotFoundError,
  ReconciliationPolicyError,
  ReconciliationTransitionNotAllowedError,
} from './reconciliations';

export function reconciliationApiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof ReconciliationCompanyNotFoundError || error instanceof ReconciliationNotFoundError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  }
  if (error instanceof ReconciliationTransitionNotAllowedError) return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
  if (error instanceof ReconciliationPolicyError) return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
  console.error('Unexpected reconciliations API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}
