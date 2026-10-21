import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { listIncidents, reportIncident } from '@/modules/incidents/incidents';
import { incidentApiError } from '@/modules/incidents/incident-api-error';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const url = new URL(request.url);
    const result = await listIncidents({
      actorId: session.user.id,
      companyId,
      status: url.searchParams.get('status') ?? undefined,
      incidentType: url.searchParams.get('type') ?? undefined,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    return incidentApiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const incident = await reportIncident(await request.json(), session.user.id, companyId);
    return NextResponse.json({ data: incident }, { status: 201 });
  } catch (error) {
    return incidentApiError(error);
  }
}
