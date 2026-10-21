import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { listServiceReminders } from '@/modules/maintenance/service-plans';
import { servicePlanApiError } from '@/modules/maintenance/service-plan-api-error';

export const runtime = 'nodejs';

/** MNT-03 (D-075): the computed preventive-service reminder register. */
export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const result = await listServiceReminders({ actorId: session.user.id, companyId });
    return NextResponse.json({ data: result });
  } catch (error) {
    return servicePlanApiError(error);
  }
}
