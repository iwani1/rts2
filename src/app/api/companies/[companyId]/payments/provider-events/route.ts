import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { providerPaymentApiError } from '@/modules/finance/provider-payment-api-error';
import { listProviderPaymentEvents } from '@/modules/finance/provider-payments';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await listProviderPaymentEvents({
      actorId: session.user.id, companyId, status: url.searchParams.get('status') ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return providerPaymentApiError(error);
  }
}
