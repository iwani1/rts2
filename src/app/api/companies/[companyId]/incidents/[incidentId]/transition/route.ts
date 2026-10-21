import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import {
  IncidentNotFoundError,
  IncidentTransitionNotAllowedError,
  transitionIncident,
} from '@/modules/incidents/incidents';
import { incidentApiError } from '@/modules/incidents/incident-api-error';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ companyId: string; incidentId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, incidentId } = await context.params;
    try {
      const incident = await transitionIncident(await request.json(), session.user.id, companyId, incidentId);
      return NextResponse.json({ data: incident });
    } catch (error) {
      if (error instanceof IncidentNotFoundError) {
        return NextResponse.json({ error: 'INCIDENT_NOT_FOUND', message: error.message }, { status: 404 });
      }
      if (error instanceof IncidentTransitionNotAllowedError) {
        return NextResponse.json({ error: 'TRANSITION_NOT_ALLOWED', message: error.message }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return incidentApiError(error);
  }
}
