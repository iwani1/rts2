import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { PaymentExceedsBalanceError } from './invoices';

export class ProviderNotConfiguredError extends Error {
  readonly code = 'PROVIDER_NOT_CONFIGURED';
  readonly statusCode = 503;
  constructor() { super('Payment provider is not configured.'); this.name = 'ProviderNotConfiguredError'; }
}
export class ProviderSignatureError extends Error {
  readonly code = 'PROVIDER_SIGNATURE_INVALID';
  readonly statusCode = 401;
  constructor() { super('Webhook signature verification failed.'); this.name = 'ProviderSignatureError'; }
}
export class ProviderPayloadError extends Error {
  readonly code = 'PROVIDER_PAYLOAD_INVALID';
  readonly statusCode = 400;
  constructor(message: string) { super(message); this.name = 'ProviderPayloadError'; }
}
export class ProviderEventNotFoundError extends Error {
  readonly code = 'PROVIDER_EVENT_NOT_FOUND';
  constructor() { super('Provider payment event not found.'); this.name = 'ProviderEventNotFoundError'; }
}
export class ProviderPolicyError extends Error {
  readonly code = 'PROVIDER_POLICY';
  readonly statusCode = 422;
  constructor(message: string) { super(message); this.name = 'ProviderPolicyError'; }
}

export type ProviderConfig = {
  provider: 'paystack';
  configured: boolean;
  state: 'NOT_CONFIGURED' | 'CONFIGURED_UNVERIFIED';
  note: string;
};

export function getProviderConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  const configured = Boolean(env.PAYSTACK_SECRET_KEY?.trim());
  return {
    provider: 'paystack',
    configured,
    state: configured ? 'CONFIGURED_UNVERIFIED' : 'NOT_CONFIGURED',
    note: configured
      ? 'Credentials are configured, but the integration is not live: no sandbox test transaction has been verified yet.'
      : 'Not configured: set PAYSTACK_SECRET_KEY to receive Paystack webhooks.',
  };
}

/** Paystack signs the raw body with HMAC-SHA512 hex. Constant-time compare. */
export function verifyPaystackSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const given = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export type WebhookPlan =
  | { kind: 'IGNORE'; eventType: string; reference: string | null; note: string }
  | {
      kind: 'RECORD'; eventType: 'charge.success'; reference: string;
      amountPesewas: number; currency: string; invoiceReference: string | null;
      paidDate: string | null; status: 'RECEIVED' | 'IGNORED'; note: string | null;
    };

const paystackPayloadSchema = z.object({
  event: z.string().min(1),
  data: z.object({
    reference: z.string().trim().min(1).max(200).optional(),
    amount: z.number().int().positive().safe().optional(),
    currency: z.string().trim().min(1).max(10).optional(),
    paid_at: z.string().min(1).optional(),
    status: z.string().optional(),
    metadata: z.unknown().optional(),
  }).passthrough(),
}).passthrough();

function metadataInvoiceReference(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  for (const key of ['invoiceReference', 'invoice_reference']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  }
  return null;
}

/** Pure decision: what should happen to a verified payload. */
export function planPaystackWebhook(parsed: unknown): WebhookPlan {
  const payload = paystackPayloadSchema.parse(parsed);
  const reference = payload.data.reference ?? null;
  if (payload.event !== 'charge.success') {
    return {
      kind: 'IGNORE', eventType: payload.event, reference,
      note: 'Only charge.success events enter the payment inbox.',
    };
  }
  if (!reference || payload.data.amount === undefined || !payload.data.currency) {
    throw new ProviderPayloadError('charge.success payload is missing a reference, amount or currency.');
  }
  if (payload.data.status && payload.data.status !== 'success') {
    return {
      kind: 'IGNORE', eventType: payload.event, reference,
      note: `Charge status was ${payload.data.status}, not success.`,
    };
  }
  const isGhs = payload.data.currency.toUpperCase() === 'GHS';
  return {
    kind: 'RECORD',
    eventType: 'charge.success',
    reference,
    amountPesewas: payload.data.amount,
    currency: payload.data.currency.toUpperCase(),
    invoiceReference: metadataInvoiceReference(payload.data.metadata),
    paidDate: payload.data.paid_at ? payload.data.paid_at.slice(0, 10) : null,
    status: isGhs ? 'RECEIVED' : 'IGNORED',
    note: isGhs ? null : `Currency ${payload.data.currency} is not GHS; never applied automatically.`,
  };
}

const READ_SCOPES = ['GLOBAL', 'COMPANY', 'READ_ONLY'] as const;
const WRITE_SCOPES = ['GLOBAL', 'COMPANY'] as const;

async function requireInvoiceAccess(actorId: string, companyId: string, scopes: readonly string[]) {
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'invoice:manage' });
  if (!access.allowed || !access.scopes.some((scope) => scopes.includes(scope))) {
    throw new PermissionDeniedError();
  }
}

/**
 * FIN-04 / D-084 webhook entry. Verifies before parsing trust, and is
 * idempotent on (companyId, provider, providerReference): a repeated
 * delivery returns the stored event and records nothing new.
 */
export async function handlePaystackWebhook(rawBody: string, signatureHeader: string | null) {
  const config = getProviderConfig();
  if (!config.configured) throw new ProviderNotConfiguredError();
  const secret = process.env.PAYSTACK_SECRET_KEY as string;
  if (!verifyPaystackSignature(rawBody, signatureHeader, secret)) throw new ProviderSignatureError();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    throw new ProviderPayloadError('Webhook body was not valid JSON.');
  }
  const plan = planPaystackWebhook(parsed);

  const prisma = getPrisma();
  // Company resolution: a metadata invoice reference names exactly one
  // company when it can; this is a single-operator deployment, so the
  // fallback is the sole ACTIVE company (D-084).
  let companyId: string | null = null;
  if (plan.kind === 'RECORD' && plan.invoiceReference) {
    const matches = await prisma.corporateInvoice.findMany({
      where: { reference: plan.invoiceReference }, select: { companyId: true },
    });
    const distinct = [...new Set(matches.map((row) => row.companyId))];
    if (distinct.length === 1) companyId = distinct[0];
    else if (distinct.length > 1) {
      throw new ProviderPolicyError('The invoice reference matches more than one company.');
    }
  }
  if (!companyId) {
    const companies = await prisma.company.findMany({
      where: { status: 'ACTIVE' }, select: { id: true }, take: 2,
    });
    if (companies.length !== 1) {
      throw new ProviderPolicyError('Cannot resolve the receiving company for this webhook.');
    }
    companyId = companies[0].id;
  }

  if (plan.kind === 'IGNORE' && !plan.reference) {
    return { received: true, recorded: false, duplicate: false, status: 'IGNORED' as const };
  }
  const reference = plan.reference as string;
  const existing = await prisma.paymentProviderEvent.findUnique({
    where: { companyId_provider_providerReference: { companyId, provider: 'paystack', providerReference: reference } },
    select: { id: true, status: true },
  });
  if (existing) {
    return { received: true, recorded: true, duplicate: true, eventId: existing.id, status: existing.status };
  }
  const created = await prisma.paymentProviderEvent.create({
    data: {
      companyId,
      provider: 'paystack',
      providerReference: reference,
      eventType: plan.eventType,
      amountPesewas: plan.kind === 'RECORD' ? plan.amountPesewas : null,
      currency: plan.kind === 'RECORD' ? plan.currency : null,
      invoiceReference: plan.kind === 'RECORD' ? plan.invoiceReference : null,
      paidDate: plan.kind === 'RECORD' && plan.paidDate ? new Date(`${plan.paidDate}T00:00:00.000Z`) : null,
      status: plan.kind === 'RECORD' ? plan.status : 'IGNORED',
      note: plan.kind === 'RECORD' ? plan.note : plan.note,
      rawPayload: parsed as object,
    },
    select: { id: true, status: true },
  });
  return { received: true, recorded: true, duplicate: false, eventId: created.id, status: created.status };
}

export async function listProviderPaymentEvents(input: {
  actorId: string; companyId: string; status?: string;
}) {
  await requireInvoiceAccess(input.actorId, input.companyId, READ_SCOPES);
  const prisma = getPrisma();
  const rows = await prisma.paymentProviderEvent.findMany({
    where: {
      companyId: input.companyId,
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, provider: true, providerReference: true, eventType: true,
      amountPesewas: true, currency: true, invoiceReference: true, paidDate: true,
      status: true, note: true, appliedInvoiceId: true, appliedAt: true, createdAt: true,
    },
  });
  return {
    events: rows.map((row) => ({
      ...row,
      paidDate: row.paidDate ? row.paidDate.toISOString().slice(0, 10) : null,
      appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

const applySchema = z.object({
  actorId: z.string().trim().min(1).max(128),
  companyId: z.string().trim().min(1).max(128),
  eventId: z.string().trim().min(1).max(128),
  invoiceId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(8).max(500),
}).strict();

/**
 * Applies a RECEIVED provider event to an ISSUED invoice under exactly the
 * manual payment rules (locked invoice, recorded sum, never above the
 * outstanding balance, PAID flip with history + audit) — D-084.
 */
export async function applyProviderPaymentEvent(input: unknown) {
  const data = applySchema.parse(input);
  await requireInvoiceAccess(data.actorId, data.companyId, WRITE_SCOPES);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const lockedInvoice = await tx.$queryRaw<Array<{ id: string; status: string; totalPesewas: number; reference: string }>>`
      SELECT "id", "status", "totalPesewas", "reference" FROM "CorporateInvoice"
      WHERE "id" = ${data.invoiceId} AND "companyId" = ${data.companyId}
      FOR UPDATE
    `;
    const invoice = lockedInvoice[0];
    if (!invoice) throw new ProviderEventNotFoundError();
    const lockedEvent = await tx.$queryRaw<Array<{
      id: string; status: string; amountPesewas: number | null; provider: string;
      providerReference: string; paidDate: Date | null;
    }>>`
      SELECT "id", "status", "amountPesewas", "provider", "providerReference", "paidDate" FROM "PaymentProviderEvent"
      WHERE "id" = ${data.eventId} AND "companyId" = ${data.companyId}
      FOR UPDATE
    `;
    const event = lockedEvent[0];
    if (!event) throw new ProviderEventNotFoundError();
    if (event.status !== 'RECEIVED') {
      throw new ProviderPolicyError(`Provider event is ${event.status}; only RECEIVED events can be applied.`);
    }
    if (event.amountPesewas === null) {
      throw new ProviderPolicyError('Provider event carries no amount and cannot be applied.');
    }
    if (invoice.status !== 'ISSUED') {
      throw new ProviderPolicyError('Provider payments may only be applied to ISSUED invoices.');
    }
    const prior = await tx.invoicePayment.findMany({
      where: { companyId: data.companyId, invoiceId: data.invoiceId },
      select: { amountPesewas: true },
    });
    const paidBefore = prior.reduce((sum, row) => sum + row.amountPesewas, 0);
    const outstandingBefore = invoice.totalPesewas - paidBefore;
    if (event.amountPesewas > outstandingBefore) throw new PaymentExceedsBalanceError(outstandingBefore);

    const payment = await tx.invoicePayment.create({
      data: {
        companyId: data.companyId, invoiceId: data.invoiceId,
        amountPesewas: event.amountPesewas,
        method: event.provider === 'paystack' ? 'Paystack' : event.provider,
        reference: event.providerReference,
        receivedAt: event.paidDate ?? new Date(),
        reason: data.reason,
        recordedById: data.actorId,
      },
    });
    const outstandingAfter = outstandingBefore - event.amountPesewas;
    await tx.paymentProviderEvent.update({
      where: { id: data.eventId },
      data: {
        status: 'APPLIED', appliedInvoiceId: data.invoiceId, appliedPaymentId: payment.id,
        appliedById: data.actorId, appliedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: data.actorId, companyId: data.companyId,
        action: 'PROVIDER_PAYMENT_APPLIED', entityType: 'PAYMENT_PROVIDER_EVENT', entityId: data.eventId,
        summary: {
          invoiceReference: invoice.reference, paymentId: payment.id,
          amountPesewas: event.amountPesewas, providerReference: event.providerReference,
          outstandingPesewas: outstandingAfter, reason: data.reason,
        },
      },
    });
    if (outstandingAfter === 0) {
      const changed = await tx.corporateInvoice.updateMany({
        where: { id: data.invoiceId, companyId: data.companyId, status: 'ISSUED' },
        data: { status: 'PAID' },
      });
      if (changed.count !== 1) {
        throw new ProviderPolicyError('The invoice changed while the provider payment was being applied; retry.');
      }
      const latest = await tx.corporateInvoiceStatusHistory.findFirst({
        where: { companyId: data.companyId, invoiceId: data.invoiceId },
        orderBy: { sequence: 'desc' }, select: { sequence: true },
      });
      await tx.corporateInvoiceStatusHistory.create({
        data: {
          companyId: data.companyId, invoiceId: data.invoiceId, sequence: (latest?.sequence ?? 0) + 1,
          actorId: data.actorId, fromStatus: 'ISSUED', toStatus: 'PAID',
          reason: 'Paid in full by recorded payments',
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: data.actorId, companyId: data.companyId,
          action: 'INVOICE_MARKED_PAID', entityType: 'CORPORATE_INVOICE', entityId: data.invoiceId,
          summary: { reference: invoice.reference, paymentId: payment.id, totalPesewas: invoice.totalPesewas },
        },
      });
    }
    return {
      eventId: data.eventId, invoiceId: data.invoiceId, paymentId: payment.id,
      outstandingPesewas: outstandingAfter,
      invoiceStatus: outstandingAfter === 0 ? 'PAID' : 'ISSUED',
    };
  });
}
