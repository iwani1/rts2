import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { IncidentNotFoundError, getIncidentDetail } from '@/modules/incidents/incidents';
import { incidentApiError } from '@/modules/incidents/incident-api-error';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ companyId: string; incidentId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, incidentId } = await context.params;
    try {
      const detail = await getIncidentDetail({ actorId: session.user.id, companyId, incidentId });
      return NextResponse.json({ data: detail });
    } catch (error) {
      if (error instanceof IncidentNotFoundError) {
        return NextResponse.json({ error: 'INCIDENT_NOT_FOUND', message: error.message }, { status: 404 });
      }
      throw error;
    }
  } catch (error) {
    return incidentApiError(error);
  }
}
