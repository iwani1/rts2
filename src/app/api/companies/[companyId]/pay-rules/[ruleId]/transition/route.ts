import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { driverPayApiError } from '@/modules/finance/driver-pay-api-error';
import { transitionPayRule } from '@/modules/finance/driver-pay';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ companyId: string; ruleId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, ruleId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const result = await transitionPayRule({ ...body, actorId: session.user.id, companyId, ruleId });
    return NextResponse.json(result);
  } catch (error) {
    return driverPayApiError(error);
  }
}
