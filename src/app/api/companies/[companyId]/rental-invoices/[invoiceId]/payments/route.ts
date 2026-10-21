import { NextResponse } from 'next/server';
import { recordRentalInvoicePayment, rentalInvoiceErrorStatus } from '@/modules/finance/rental-invoices';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; invoiceId: string }> };

function errorResponse(error: unknown) {
  const status = rentalInvoiceErrorStatus(error);
  const message = status === 500 ? 'The request could not be completed.' : (error instanceof Error ? error.message : 'The request could not be completed.');
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, invoiceId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const result = await recordRentalInvoicePayment(session.user.id, companyId, invoiceId, body);
    return NextResponse.json({ result }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
