import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { IncidentNotFoundError } from '@/modules/incidents/incidents';
import { confirmIncidentReplacement } from '@/modules/incidents/incident-response';
import { incidentApiError } from '@/modules/incidents/incident-api-error';

export const runtime = 'nodejs';

/** INC-02 (D-072): confirm a replacement vehicle/driver on the incident trip. */
export async function POST(request: Request, context: { params: Promise<{ companyId: string; incidentId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, incidentId } = await context.params;
    try {
      const result = await confirmIncidentReplacement(await request.json(), session.user.id, companyId, incidentId);
      return NextResponse.json({ data: result });
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
