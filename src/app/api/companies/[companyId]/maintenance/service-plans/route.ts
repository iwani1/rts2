import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { upsertServicePlan } from '@/modules/maintenance/service-plans';
import { servicePlanApiError } from '@/modules/maintenance/service-plan-api-error';

export const runtime = 'nodejs';

/** MNT-03 (D-075): create or replace a vehicle's service plan. */
export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const plan = await upsertServicePlan(await request.json(), session.user.id, companyId);
    return NextResponse.json({ data: plan });
  } catch (error) {
    return servicePlanApiError(error);
  }
}
