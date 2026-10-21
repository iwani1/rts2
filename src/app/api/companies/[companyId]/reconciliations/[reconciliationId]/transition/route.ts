import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { transitionReconciliation } from '@/modules/finance/reconciliations';
import { reconciliationApiError } from '@/modules/finance/reconciliation-api-error';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ companyId: string; reconciliationId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, reconciliationId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const result = await transitionReconciliation({ ...body, actorId: session.user.id, companyId, reconciliationId });
    return NextResponse.json(result);
  } catch (error) {
    return reconciliationApiError(error);
  }
}
