import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { handleSmsDeliveryReport } from '@/modules/notifications/sms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * NTF-02 (D-069): provider delivery-report webhook. Only a confirmation
 * arriving here may mark an SMS DELIVERED. Authenticated by the shared
 * SMS_WEBHOOK_SECRET header; unconfigured secret disables the endpoint.
 */
export async function POST(request: Request) {
  const expected = process.env.SMS_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'NOT_CONFIGURED', message: 'SMS delivery reports are not configured.' }, { status: 503 });
  }
  if (!secretsMatch(request.headers.get('x-webhook-secret'), expected)) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Invalid webhook secret.' }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    reference?: unknown; providerMessageId?: unknown; status?: unknown; reason?: unknown;
  } | null;
  const status = typeof body?.status === 'string' ? body.status.toLowerCase() : '';
  const delivered = ['delivered', 'delivery', 'success', 'ok'].includes(status);
  const failed = ['failed', 'failure', 'undelivered', 'rejected', 'expired'].includes(status);
  if (!delivered && !failed) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Unknown delivery status.' }, { status: 400 });
  }
  const matched = await handleSmsDeliveryReport({
    reference: typeof body?.reference === 'string' ? body.reference : undefined,
    providerMessageId: typeof body?.providerMessageId === 'string' ? body.providerMessageId : undefined,
    delivered,
    failureReason: typeof body?.reason === 'string' ? body.reason : undefined,
  });
  if (!matched) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'No matching SMS notification.' }, { status: 404 });
  }
  return NextResponse.json({ data: { recorded: true } });
}
