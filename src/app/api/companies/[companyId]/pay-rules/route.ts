import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { driverPayApiError } from '@/modules/finance/driver-pay-api-error';
import { createPayRule, listPayRules } from '@/modules/finance/driver-pay';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    return NextResponse.json(await listPayRules({ actorId: session.user.id, companyId }));
  } catch (error) {
    return driverPayApiError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const { companyId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const rule = await createPayRule({ ...body, actorId: session.user.id, companyId });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return driverPayApiError(error);
  }
}
