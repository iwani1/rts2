import nodemailer from 'nodemailer';
import { getPrisma } from '@/server/prisma';

/**
 * NTF-03 (D-070): email provider interface and dispatch pipeline.
 *
 * Email has no delivery-report channel, so a successful SMTP handover marks
 * a row SENT ("handed to the mail server") — never DELIVERED. Without SMTP
 * configuration the feature is Not configured and nothing is sent.
 */
export interface EmailProvider {
  readonly id: string;
  send(input: {
    to: string; subject: string; text: string; reference: string;
  }): Promise<{ providerMessageId: string | null }>;
}

export class EmailProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

type SendMail = (input: {
  from: string; to: string; subject: string; text: string;
}) => Promise<{ messageId?: string }>;

/** SMTP adapter (nodemailer). Activates only with real SMTP configuration. */
export function createSmtpProvider(options: {
  from: string; sendMail: SendMail;
}): EmailProvider {
  return {
    id: 'smtp',
    async send({ to, subject, text }) {
      try {
        const result = await options.sendMail({ from: options.from, to, subject, text });
        return { providerMessageId: result.messageId ?? null };
      } catch (error) {
        throw new EmailProviderError(
          `SMTP send failed: ${error instanceof Error ? error.message : 'unknown error'}`.slice(0, 500),
        );
      }
    },
  };
}

export type EmailConfiguration = {
  configured: boolean;
  provider: string | null;
  message: string;
};

export function emailConfiguration(env: Record<string, string | undefined> = process.env): EmailConfiguration {
  if (env.EMAIL_PROVIDER !== 'smtp') {
    return {
      configured: false, provider: null,
      message: 'Email is not configured. Set EMAIL_PROVIDER=smtp with SMTP_HOST and SMTP_FROM to enable sending.',
    };
  }
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    return {
      configured: false, provider: 'smtp',
      message: 'Email provider smtp is selected but SMTP_HOST and SMTP_FROM are not both set.',
    };
  }
  return { configured: true, provider: 'smtp', message: 'Email provider smtp is configured.' };
}

export function getEmailProvider(env: Record<string, string | undefined> = process.env): EmailProvider | null {
  const configuration = emailConfiguration(env);
  if (!configuration.configured) return null;
  const port = Number(env.SMTP_PORT ?? '587');
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST as string,
    port: Number.isFinite(port) ? port : 587,
    secure: env.SMTP_SECURE === 'true',
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' }
      : undefined,
  });
  return createSmtpProvider({
    from: env.SMTP_FROM as string,
    sendMail: async (input) => transporter.sendMail(input),
  });
}

const MAX_ATTEMPTS = 3;
const backoffMs = (attempts: number) => attempts * 5 * 60_000;

/**
 * Sends waiting email rows through the injected provider, with the same
 * attempts/backoff discipline as SMS (D-069). Success means SENT (handed
 * to the mail server), the strongest truthful claim for email (D-070).
 */
export async function dispatchPendingEmailNotifications(options: {
  provider: EmailProvider | null;
  limit?: number;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  if (!options.provider) {
    return { configured: false, attempted: 0, sent: 0, failed: 0 };
  }
  const prisma = getPrisma();
  const rows = await prisma.notification.findMany({
    where: {
      channel: 'EMAIL',
      OR: [
        { status: 'PENDING' },
        {
          status: 'FAILED', attempts: { lt: MAX_ATTEMPTS },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: options.limit ?? 50,
    select: { id: true, destination: true, title: true, body: true, attempts: true },
  });
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const attempts = row.attempts + 1;
    if (!row.destination) {
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: 'FAILED', attempts, lastError: 'No destination email recorded.', nextAttemptAt: null },
      });
      failed += 1;
      continue;
    }
    try {
      const result = await options.provider.send({
        to: row.destination,
        subject: row.title,
        text: row.body,
        reference: row.id,
      });
      await prisma.notification.update({
        where: { id: row.id },
        data: {
          status: 'SENT', attempts, providerMessageId: result.providerMessageId,
          lastError: null, nextAttemptAt: null,
        },
      });
      sent += 1;
    } catch (error) {
      await prisma.notification.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          attempts,
          lastError: (error instanceof Error ? error.message : 'Email send failed.').slice(0, 500),
          nextAttemptAt: attempts >= MAX_ATTEMPTS ? null : new Date(now.valueOf() + backoffMs(attempts)),
        },
      });
      failed += 1;
    }
  }
  return { configured: true, attempted: rows.length, sent, failed };
}
