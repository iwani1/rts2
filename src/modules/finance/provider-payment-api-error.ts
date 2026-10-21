import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { PaymentExceedsBalanceError } from './invoices';
import {
  ProviderEventNotFoundError,
  ProviderPolicyError,
} from './provider-payments';

export function providerPaymentApiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof ProviderEventNotFoundError) return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof PaymentExceedsBalanceError) return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
  if (error instanceof ProviderPolicyError) return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
  console.error('Unexpected provider payments API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}
