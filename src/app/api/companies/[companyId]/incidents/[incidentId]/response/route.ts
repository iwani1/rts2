import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { IncidentNotFoundError } from '@/modules/incidents/incidents';
import { getIncidentResponsePlan } from '@/modules/incidents/incident-response';
import { incidentApiError } from '@/modules/incidents/incident-api-error';

export const runtime = 'nodejs';

/** INC-02 (D-072): affected trips and eligible replacements for an incident. */
export async function GET(request: Request, context: { params: Promise<{ companyId: string; incidentId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, incidentId } = await context.params;
    try {
      const plan = await getIncidentResponsePlan({ actorId: session.user.id, companyId, incidentId });
      return NextResponse.json({ data: plan });
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
