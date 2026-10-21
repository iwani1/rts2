import { NextResponse } from 'next/server';
import { decideOwnRentalQuotation, rentalQuotationErrorStatus } from '@/modules/rentals/rental-quotations';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; quotationId: string }> };

function errorResponse(error: unknown) {
  const status = rentalQuotationErrorStatus(error);
  const message = status === 500 ? 'The request could not be completed.' : (error instanceof Error ? error.message : 'The request could not be completed.');
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, quotationId } = await context.params;
    const body = await request.json() as { decision: 'ACCEPTED' | 'DECLINED'; reason: string };
    const quotation = await decideOwnRentalQuotation(session.user.id, companyId, quotationId, body);
    return NextResponse.json({ quotation }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
