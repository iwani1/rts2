import { ZodError } from 'zod';
import { requireApiSession } from '@/modules/auth/api';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  InvalidInvoiceCursorError,
  InvoiceCompanyNotFoundError,
  InvoicePolicyError,
  InvoiceValidationError,
  generateCorporateInvoice,
  listCorporateInvoices,
} from '@/modules/finance/invoices';

function apiError(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: 'VALIDATION_ERROR', issues: error.issues }, { status: 400 });
  if (error instanceof PermissionDeniedError) return Response.json({ error: 'PERMISSION_DENIED', message: error.message }, { status: 403 });
  if (error instanceof InvoiceCompanyNotFoundError) return Response.json({ error: error.code, message: error.message }, { status: 404 });
  if (error instanceof InvoicePolicyError) return Response.json({ error: error.code, message: error.message }, { status: 422 });
  if (error instanceof InvoiceValidationError || error instanceof InvalidInvoiceCursorError) return Response.json({ error: error.code, message: error.message }, { status: 400 });
  console.error('Unexpected invoices API error', error);
  return Response.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await requireApiSession();
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await listCorporateInvoices({
      actorId: session.user.id,
      companyId,
      clientId: url.searchParams.get('clientId') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await requireApiSession();
    const { companyId } = await context.params;
    const result = await generateCorporateInvoice(await request.json(), session.user.id, companyId);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
