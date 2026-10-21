import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  IncidentCompanyNotFoundError,
  IncidentValidationError,
} from './incidents';

export function incidentApiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
  if (error instanceof IncidentCompanyNotFoundError) return NextResponse.json({ error: 'COMPANY_NOT_FOUND', message: error.message }, { status: 404 });
  if (error instanceof IncidentValidationError) return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
  console.error('Unexpected incidents API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}
