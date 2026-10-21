import { getPrisma } from '@/server/prisma';

/**
 * NTF-02 (D-069): SMS provider interface and delivery pipeline.
 *
 * A provider only ever moves a row PENDING/FAILED -> SENT (accepted). Only
 * `handleSmsDeliveryReport` (the provider's delivery confirmation) may mark
 * DELIVERED. Without provider credentials the feature is Not configured:
 * rows wait as PENDING and dispatch reports that honestly.
 */
export interface SmsProvider {
  readonly id: string;
  send(input: { to: string; message: string; reference: string }): Promise<{ providerMessageId: string | null }>;
}

export class SmsProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmsProviderError';
  }
}

type FetchImpl = (url: string, init: RequestInit) => Promise<{
  ok: boolean; status: number; text: () => Promise<string>;
}>;

/**
 * Arkesel v2-shaped adapter. It activates only with real credentials; the
 * exact vendor account behaviour (sender-id approval, balance, delivery
 * report format) must be live-verified by the owner with their account
 * before production use — this code never simulates a successful send.
 */
export function createArkeselProvider(options: {
  apiKey: string; senderId: string; baseUrl?: string; fetchImpl?: FetchImpl;
}): SmsProvider {
  const baseUrl = options.baseUrl ?? 'https://sms.arkesel.com';
  const fetchImpl: FetchImpl = options.fetchImpl ?? (async (url, init) => fetch(url, init));
  return {
    id: 'arkesel',
    async send({ to, message, reference }) {
      const response = await fetchImpl(`${baseUrl}/api/v2/sms/send`, {
        method: 'POST',
        headers: { 'api-key': options.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: options.senderId, message, recipients: [to], reference }),
      });
      const text = await response.text();
      type ArkeselResponse = { status?: string; data?: Array<{ id?: string; message_id?: string }> };
      let parsed: ArkeselResponse | null = null;
      try {
        parsed = JSON.parse(text) as ArkeselResponse;
      } catch {
        parsed = null;
      }
      if (!response.ok || (parsed?.status !== undefined && parsed.status !== 'success')) {
        throw new SmsProviderError(
          `SMS provider rejected the send (HTTP ${response.status}): ${text.slice(0, 200)}`,
        );
      }
      return { providerMessageId: parsed?.data?.[0]?.id ?? parsed?.data?.[0]?.message_id ?? null };
    },
  };
}

export type SmsConfiguration = {
  configured: boolean;
  provider: string | null;
  message: string;
};

export function smsConfiguration(env: Record<string, string | undefined> = process.env): SmsConfiguration {
  if (env.SMS_PROVIDER !== 'arkesel') {
    return {
      configured: false, provider: null,
      message: 'SMS is not configured. Set SMS_PROVIDER=arkesel with ARKESEL_API_KEY and ARKESEL_SENDER_ID to enable sending.',
    };
  }
  if (!env.ARKESEL_API_KEY || !env.ARKESEL_SENDER_ID) {
    return {
      configured: false, provider: 'arkesel',
      message: 'SMS provider arkesel is selected but ARKESEL_API_KEY and ARKESEL_SENDER_ID are not both set.',
    };
  }
  return { configured: true, provider: 'arkesel', message: 'SMS provider arkesel is configured.' };
}

export function getSmsProvider(env: Record<string, string | undefined> = process.env): SmsProvider | null {
  const configuration = smsConfiguration(env);
  if (!configuration.configured) return null;
  return createArkeselProvider({
    apiKey: env.ARKESEL_API_KEY as string,
    senderId: env.ARKESEL_SENDER_ID as string,
    baseUrl: env.ARKESEL_BASE_URL || undefined,
  });
}

const MAX_ATTEMPTS = 3;
const backoffMs = (attempts: number) => attempts * 5 * 60_000;

/**
 * Sends waiting SMS rows through the injected provider. Invoked explicitly
 * (Super-Admin endpoint or an external scheduler); there is no background
 * worker in the app. Returns counts only — outcomes are also on the rows.
 */
export async function dispatchPendingSmsNotifications(options: {
  provider: SmsProvider | null;
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
      channel: 'SMS',
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
    select: {
      id: true, destination: true, title: true, body: true, attempts: true,
    },
  });
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const attempts = row.attempts + 1;
    if (!row.destination) {
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: 'FAILED', attempts, lastError: 'No destination telephone recorded.', nextAttemptAt: null },
      });
      failed += 1;
      continue;
    }
    try {
      const result = await options.provider.send({
        to: row.destination,
        message: `${row.title}\n${row.body}`,
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
          lastError: (error instanceof Error ? error.message : 'SMS send failed.').slice(0, 500),
          nextAttemptAt: attempts >= MAX_ATTEMPTS ? null : new Date(now.valueOf() + backoffMs(attempts)),
        },
      });
      failed += 1;
    }
  }
  return { configured: true, attempted: rows.length, sent, failed };
}

/**
 * Applies a provider delivery confirmation. `DELIVERED` is set only here
 * (D-069) — never at send time. Returns false when no row matches.
 */
export async function handleSmsDeliveryReport(input: {
  reference?: string; providerMessageId?: string; delivered: boolean; failureReason?: string;
}): Promise<boolean> {
  const prisma = getPrisma();
  const row = await prisma.notification.findFirst({
    where: {
      channel: 'SMS',
      ...(input.providerMessageId
        ? { providerMessageId: input.providerMessageId }
        : { id: input.reference }),
    },
    select: { id: true, status: true },
  });
  if (!row) return false;
  if (input.delivered) {
    await prisma.notification.update({
      where: { id: row.id },
      data: { status: 'DELIVERED', lastError: null, nextAttemptAt: null },
    });
  } else {
    await prisma.notification.update({
      where: { id: row.id },
      data: {
        status: 'FAILED',
        lastError: (input.failureReason ?? 'Provider reported delivery failure.').slice(0, 500),
        nextAttemptAt: null,
      },
    });
  }
  return true;
}
