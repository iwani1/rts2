import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuth } from '@/server/auth';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  InvoiceCompanyNotFoundError,
  InvoiceNotFoundError,
  InvoicePolicyError,
  PaymentExceedsBalanceError,
  recordInvoicePayment,
} from '@/modules/finance/invoices';

export const runtime = 'nodejs';

function apiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return NextResponse.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof InvoiceCompanyNotFoundError || error instanceof InvoiceNotFoundError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: 404 });
  }
  if (error instanceof PaymentExceedsBalanceError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
  }
  if (error instanceof InvoicePolicyError) return NextResponse.json({ error: error.code, message: error.message }, { status: 422 });
  console.error('Unexpected invoice payment API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string; invoiceId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, invoiceId } = await context.params;
    const result = await recordInvoicePayment(await request.json(), session.user.id, companyId, invoiceId);
    return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
