import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ProviderPayloadError,
  getProviderConfig,
  planPaystackWebhook,
  verifyPaystackSignature,
} from './provider-payments';

const SECRET = 'sk_test_fixture_secret';

function sign(body: string, secret = SECRET) {
  return createHmac('sha512', secret).update(body).digest('hex');
}

describe('Paystack webhook signature (FIN-04 / D-084)', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'ref-1', amount: 15000, currency: 'GHS' } });

  it('accepts the correct HMAC-SHA512 hex signature', () => {
    expect(verifyPaystackSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('rejects tampered bodies, wrong secrets and missing signatures', () => {
    expect(verifyPaystackSignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, sign(body, 'other-secret'), SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, null, SECRET)).toBe(false);
    expect(verifyPaystackSignature(body, 'abc', SECRET)).toBe(false);
  });
});

describe('provider configuration honesty (FIN-04 / D-084)', () => {
  it('reports Not configured without a secret, and never claims live', () => {
    expect(getProviderConfig({} as NodeJS.ProcessEnv).state).toBe('NOT_CONFIGURED');
    const configured = getProviderConfig({ PAYSTACK_SECRET_KEY: SECRET } as unknown as NodeJS.ProcessEnv);
    expect(configured.state).toBe('CONFIGURED_UNVERIFIED');
    expect(configured.note).toMatch(/not live/i);
  });
});

describe('webhook planning (FIN-04 / D-084)', () => {
  it('records a successful GHS charge into the inbox', () => {
    const plan = planPaystackWebhook({
      event: 'charge.success',
      data: {
        reference: 'psk_123', amount: 15000, currency: 'GHS', status: 'success',
        paid_at: '2026-10-21T10:00:00.000Z', metadata: { invoiceReference: 'INV-ABC' },
      },
    });
    expect(plan).toMatchObject({
      kind: 'RECORD', status: 'RECEIVED', amountPesewas: 15000, invoiceReference: 'INV-ABC', paidDate: '2026-10-21',
    });
  });

  it('ignores non-charge events and non-GHS charges, and rejects malformed charges', () => {
    expect(planPaystackWebhook({ event: 'transfer.success', data: { reference: 't1' } }))
      .toMatchObject({ kind: 'IGNORE' });
    expect(planPaystackWebhook({
      event: 'charge.success',
      data: { reference: 'x1', amount: 100, currency: 'NGN', status: 'success' },
    })).toMatchObject({ kind: 'RECORD', status: 'IGNORED' });
    expect(() => planPaystackWebhook({ event: 'charge.success', data: { amount: 100 } }))
      .toThrow(ProviderPayloadError);
  });
});
