import { describe, expect, it } from 'vitest';
import {
  createSmtpProvider,
  emailConfiguration,
  EmailProviderError,
  getEmailProvider,
} from './email';

describe('emailConfiguration (NTF-03 / D-070)', () => {
  it('is Not configured without provider env', () => {
    expect(emailConfiguration({}).configured).toBe(false);
    expect(getEmailProvider({})).toBeNull();
    expect(emailConfiguration({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'mail.example' }).configured).toBe(false);
  });

  it('configures with SMTP host and sender', () => {
    const env = { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'mail.example', SMTP_FROM: 'Richie <no-reply@example.invalid>' };
    expect(emailConfiguration(env).configured).toBe(true);
    expect(getEmailProvider(env)?.id).toBe('smtp');
  });
});

describe('SMTP provider adapter', () => {
  it('hands the message to the mailer and returns its message id', async () => {
    const seen: Array<{ from: string; to: string; subject: string; text: string }> = [];
    const provider = createSmtpProvider({
      from: 'Richie <no-reply@example.invalid>',
      sendMail: async (input) => {
        seen.push(input);
        return { messageId: 'mail-1' };
      },
    });
    const result = await provider.send({
      to: 'user@example.invalid', subject: 'Journey confirmed', text: 'Body', reference: 'n1',
    });
    expect(result.providerMessageId).toBe('mail-1');
    expect(seen[0]).toMatchObject({ to: 'user@example.invalid', subject: 'Journey confirmed' });
  });

  it('surfaces mailer failures as provider errors', async () => {
    const provider = createSmtpProvider({
      from: 'Richie <no-reply@example.invalid>',
      sendMail: async () => {
        throw new Error('Connection refused');
      },
    });
    await expect(provider.send({ to: 'u@example.invalid', subject: 'x', text: 'y', reference: 'n2' }))
      .rejects.toBeInstanceOf(EmailProviderError);
  });
});
