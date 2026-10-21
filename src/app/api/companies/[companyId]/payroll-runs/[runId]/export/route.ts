import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { driverPayApiError } from '@/modules/finance/driver-pay-api-error';
import { getPayrollRunExport } from '@/modules/finance/driver-pay';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ companyId: string; runId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId, runId } = await context.params;
    const file = await getPayrollRunExport({ actorId: session.user.id, companyId, runId });
    return new NextResponse(file.csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${file.filename}"`,
      },
    });
  } catch (error) {
    return driverPayApiError(error);
  }
}
