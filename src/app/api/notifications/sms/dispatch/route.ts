import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { isActiveSuperAdmin } from '@/modules/auth/permissions';
import {
  dispatchPendingSmsNotifications,
  getSmsProvider,
  smsConfiguration,
} from '@/modules/notifications/sms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function apiError(error: unknown) {
  console.error('Unexpected SMS dispatch API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

/**
 * NTF-02 (D-069): explicitly dispatch waiting SMS rows. Super-Admin only;
 * an external scheduler may call the same service. Without provider
 * credentials nothing is sent and the response says so.
 */
export async function POST(request: Request) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    if (!(await isActiveSuperAdmin(session.user.id))) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Only a Super Administrator can dispatch SMS.' }, { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as { limit?: unknown } | null;
    const limit = typeof body?.limit === 'number' && body.limit >= 1 && body.limit <= 200
      ? Math.floor(body.limit)
      : 50;
    const result = await dispatchPendingSmsNotifications({ provider: getSmsProvider(), limit });
    return NextResponse.json({ data: { ...result, configuration: smsConfiguration() } });
  } catch (error) {
    return apiError(error);
  }
}
