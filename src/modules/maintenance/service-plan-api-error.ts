import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  ServicePlanCompanyNotFoundError,
  ServicePlanValidationError,
} from './service-plans';

export function servicePlanApiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
  if (error instanceof ServicePlanCompanyNotFoundError) return NextResponse.json({ error: 'COMPANY_NOT_FOUND', message: error.message }, { status: 404 });
  if (error instanceof ServicePlanValidationError) return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
  console.error('Unexpected service-plan API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}
