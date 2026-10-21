import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { listVehicleLocationHistory } from '@/modules/locations/gps';
import { gpsApiError } from '@/modules/locations/gps-api-error';

export const runtime = 'nodejs';

/** GPS-01 (D-077): restricted position history for one vehicle. */
export async function GET(request: Request, context: { params: Promise<{ companyId: string; vehicleId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, vehicleId } = await context.params;
    const rows = await listVehicleLocationHistory({ actorId: session.user.id, companyId, vehicleId });
    return NextResponse.json({ data: rows });
  } catch (error) {
    return gpsApiError(error);
  }
}
