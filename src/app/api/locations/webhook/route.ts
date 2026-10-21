import { NextResponse } from 'next/server';
import {
  GpsNotConfiguredError,
  GpsOutsideOperationalPeriodError,
  GpsWebhookAuthError,
  ingestLocationReport,
} from '@/modules/locations/gps';
import { gpsApiError } from '@/modules/locations/gps-api-error';

export const runtime = 'nodejs';

/**
 * GPS-01 (D-077): provider report intake. Authenticated by the shared
 * webhook secret; reports are accepted only while the vehicle is on an
 * active trip. When GPS is not configured this refuses honestly.
 */
export async function POST(request: Request) {
  try {
    const result = await ingestLocationReport({
      payload: await request.json().catch(() => null),
      webhookSecret: request.headers.get('x-webhook-secret'),
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof GpsNotConfiguredError) {
      return NextResponse.json({ error: 'NOT_CONFIGURED', message: error.message }, { status: 503 });
    }
    if (error instanceof GpsWebhookAuthError) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: error.message }, { status: 401 });
    }
    if (error instanceof GpsOutsideOperationalPeriodError) {
      return NextResponse.json({ error: 'OUTSIDE_OPERATIONAL_PERIOD', message: error.message }, { status: 422 });
    }
    return gpsApiError(error);
  }
}
