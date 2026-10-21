import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { purgeOldVehicleLocations } from '@/modules/locations/gps';
import { gpsApiError } from '@/modules/locations/gps-api-error';

export const runtime = 'nodejs';

/** GPS-01 (D-077): apply the 90-day location retention explicitly. */
export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const result = await purgeOldVehicleLocations({ actorId: session.user.id, companyId });
    return NextResponse.json({ data: result });
  } catch (error) {
    return gpsApiError(error);
  }
}
