import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import {
  IncidentDriverNotLinkedError,
  reportIncidentAsDriver,
} from '@/modules/incidents/incidents';
import { incidentApiError } from '@/modules/incidents/incident-api-error';

export const runtime = 'nodejs';

/** INC-01/02 (D-071): a linked driver reports against their own active trip. */
export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    try {
      const incident = await reportIncidentAsDriver(await request.json(), session.user.id, companyId);
      return NextResponse.json({ data: incident }, { status: 201 });
    } catch (error) {
      if (error instanceof IncidentDriverNotLinkedError) {
        return NextResponse.json({ error: 'DRIVER_NOT_LINKED', message: error.message }, { status: 403 });
      }
      throw error;
    }
  } catch (error) {
    return incidentApiError(error);
  }
}
