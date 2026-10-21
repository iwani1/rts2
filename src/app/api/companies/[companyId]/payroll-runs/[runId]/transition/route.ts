import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { driverPayApiError } from '@/modules/finance/driver-pay-api-error';
import { transitionPayrollRun } from '@/modules/finance/driver-pay';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ companyId: string; runId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, runId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const result = await transitionPayrollRun({ ...body, actorId: session.user.id, companyId, runId });
    return NextResponse.json(result);
  } catch (error) {
    return driverPayApiError(error);
  }
}
