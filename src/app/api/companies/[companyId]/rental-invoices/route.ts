import { NextResponse } from 'next/server';
import { listRentalInvoices, rentalInvoiceErrorStatus } from '@/modules/finance/rental-invoices';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string }> };

function errorResponse(error: unknown) {
  const status = rentalInvoiceErrorStatus(error);
  const message = status === 500 ? 'The request could not be completed.' : (error instanceof Error ? error.message : 'The request could not be completed.');
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await listRentalInvoices(session.user.id, companyId, {
      status: url.searchParams.get('status') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
