import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { GpsValidationError } from './gps';

export function gpsApiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
  if (error instanceof GpsValidationError) return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
  console.error('Unexpected GPS API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}
