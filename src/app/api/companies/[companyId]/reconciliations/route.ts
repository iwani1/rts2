import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { createReconciliation, listReconciliations } from '@/modules/finance/reconciliations';
import { reconciliationApiError } from '@/modules/finance/reconciliation-api-error';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const result = await listReconciliations({ actorId: session.user.id, companyId });
    return NextResponse.json(result);
  } catch (error) {
    return reconciliationApiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const run = await createReconciliation({ ...body, actorId: session.user.id, companyId });
    return NextResponse.json({ reconciliation: run }, { status: 201 });
  } catch (error) {
    return reconciliationApiError(error);
  }
}
