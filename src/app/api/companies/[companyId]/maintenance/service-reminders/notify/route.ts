import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { notifyServiceReminders } from '@/modules/maintenance/service-plans';
import { servicePlanApiError } from '@/modules/maintenance/service-plan-api-error';

export const runtime = 'nodejs';

/** MNT-03 (D-075): alert maintenance managers about due/overdue services. */
export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const result = await notifyServiceReminders({ actorId: session.user.id, companyId });
    return NextResponse.json({ data: result });
  } catch (error) {
    return servicePlanApiError(error);
  }
}
