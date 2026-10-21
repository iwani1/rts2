import { NextResponse } from 'next/server';
import { getAuth } from '@/server/auth';
import { isActiveSuperAdmin } from '@/modules/auth/permissions';
import {
  dispatchPendingEmailNotifications,
  emailConfiguration,
  getEmailProvider,
} from '@/modules/notifications/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function apiError(error: unknown) {
  console.error('Unexpected email dispatch API error', error);
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The request could not be completed.' }, { status: 500 });
}

/**
 * NTF-03 (D-070): explicitly dispatch waiting email rows. Super-Admin only.
 * Without SMTP configuration nothing is sent and the response says so.
 */
export async function POST(request: Request) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    if (!(await isActiveSuperAdmin(session.user.id))) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Only a Super Administrator can dispatch email.' }, { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as { limit?: unknown } | null;
    const limit = typeof body?.limit === 'number' && body.limit >= 1 && body.limit <= 200
      ? Math.floor(body.limit)
      : 50;
    const result = await dispatchPendingEmailNotifications({ provider: getEmailProvider(), limit });
    return NextResponse.json({ data: { ...result, configuration: emailConfiguration() } });
  } catch (error) {
    return apiError(error);
  }
}
