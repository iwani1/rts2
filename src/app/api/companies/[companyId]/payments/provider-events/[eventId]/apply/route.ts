import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { providerPaymentApiError } from '@/modules/finance/provider-payment-api-error';
import { applyProviderPaymentEvent } from '@/modules/finance/provider-payments';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ companyId: string; eventId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, eventId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const result = await applyProviderPaymentEvent({ ...body, actorId: session.user.id, companyId, eventId });
    return NextResponse.json(result);
  } catch (error) {
    return providerPaymentApiError(error);
  }
}
