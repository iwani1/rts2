import { NextResponse } from 'next/server';
import {
  ProviderNotConfiguredError,
  ProviderPayloadError,
  ProviderPolicyError,
  ProviderSignatureError,
  handlePaystackWebhook,
} from '@/modules/finance/provider-payments';

export const runtime = 'nodejs';

/**
 * FIN-04 / D-084: the signature is verified over the raw body before the
 * payload is trusted. Nothing here ever records an invoice payment — a
 * verified charge lands in the staging inbox for governed application.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const result = await handlePaystackWebhook(rawBody, request.headers.get('x-paystack-signature'));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 503 });
    }
    if (error instanceof ProviderSignatureError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 401 });
    }
    if (error instanceof ProviderPayloadError || error instanceof ProviderPolicyError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400 });
    }
    console.error('Unexpected Paystack webhook error', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'The webhook could not be processed.' }, { status: 500 });
  }
}
