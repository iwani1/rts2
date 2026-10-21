import { NextResponse } from 'next/server';
import { cancelConfirmedRental, rentalLifecycleErrorStatus } from '@/modules/rentals/rental-lifecycle';
import { getAuth } from '@/server/auth';

export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ companyId: string; requestId: string }> };

function errorResponse(error: unknown) {
  const status = rentalLifecycleErrorStatus(error);
  const message = status === 500 ? 'The request could not be completed.' : (error instanceof Error ? error.message : 'The request could not be completed.');
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  try {
    const { companyId, requestId } = await context.params;
    const body = await request.json() as { reason: string };
    const result = await cancelConfirmedRental(session.user.id, companyId, requestId, body);
    return NextResponse.json({ result }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
