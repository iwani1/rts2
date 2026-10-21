import { describe, expect, it } from 'vitest';
import {
  createArkeselProvider,
  getSmsProvider,
  smsConfiguration,
  SmsProviderError,
} from './sms';

describe('smsConfiguration (NTF-02 / D-069)', () => {
  it('is Not configured without provider env', () => {
    expect(smsConfiguration({}).configured).toBe(false);
    expect(getSmsProvider({})).toBeNull();
    expect(smsConfiguration({ SMS_PROVIDER: 'other' }).configured).toBe(false);
  });

  it('is Not configured when credentials are incomplete', () => {
    const config = smsConfiguration({ SMS_PROVIDER: 'arkesel', ARKESEL_API_KEY: 'key-only' });
    expect(config.configured).toBe(false);
    expect(config.provider).toBe('arkesel');
    expect(getSmsProvider({ SMS_PROVIDER: 'arkesel', ARKESEL_API_KEY: 'key-only' })).toBeNull();
  });

  it('configures with full env', () => {
    const env = { SMS_PROVIDER: 'arkesel', ARKESEL_API_KEY: 'k', ARKESEL_SENDER_ID: 'RTS' };
    expect(smsConfiguration(env).configured).toBe(true);
    expect(getSmsProvider(env)?.id).toBe('arkesel');
  });
});

describe('Arkesel-shaped provider adapter', () => {
  it('posts the expected payload and returns the provider message id', async () => {
    let seenUrl = '';
    let seenBody: Record<string, unknown> = {};
    const provider = createArkeselProvider({
      apiKey: 'secret-key', senderId: 'RichieTS',
      fetchImpl: async (url, init) => {
        seenUrl = url;
        seenBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({ status: 'success', data: [{ id: 'msg-1' }] }),
        };
      },
    });
    const result = await provider.send({ to: '+233200000000', message: 'Hello', reference: 'n1' });
    expect(result.providerMessageId).toBe('msg-1');
    expect(seenUrl).toBe('https://sms.arkesel.com/api/v2/sms/send');
    expect(seenBody).toMatchObject({ sender: 'RichieTS', message: 'Hello', recipients: ['+233200000000'] });
  });

  it('throws a provider error on rejection instead of pretending success', async () => {
    const provider = createArkeselProvider({
      apiKey: 'k', senderId: 'S',
      fetchImpl: async () => ({ ok: false, status: 402, text: async () => 'Insufficient balance' }),
    });
    await expect(provider.send({ to: '+233', message: 'x', reference: 'n2' }))
      .rejects.toBeInstanceOf(SmsProviderError);
  });
});
