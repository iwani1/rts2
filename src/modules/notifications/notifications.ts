import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '@/server/prisma';
import {
  bookingAssignedNotification,
  bookingCreatedNotification,
  bookingStatusNotification,
  rentalStatusNotification,
  type NotificationContent,
} from './templates';
import { notificationPreferencesSchema } from './notification-schema';

export class NotificationCompanyNotFoundError extends Error {
  constructor() {
    super('Company not found.');
    this.name = 'NotificationCompanyNotFoundError';
  }
}
export class NotificationNotFoundError extends Error {
  constructor() {
    super('Notification not found.');
    this.name = 'NotificationNotFoundError';
  }
}

const companyIdSchema = z.string().trim().min(1).max(128);
const idSchema = z.string().trim().min(1).max(128);

export type NotificationChannel = 'IN_APP' | 'SMS' | 'EMAIL';

export type NotifyInput = {
  companyId: string;
  userId: string;
  actorId?: string;
  channel?: NotificationChannel;
  type: string;
  entityType?: string;
  entityId?: string;
  dedupeKey: string;
  /** SMS/EMAIL delivery target when the channel needs one (NTF-02/03). */
  destination?: string;
  /** In-app commits as DELIVERED; provider channels start PENDING. */
  initialStatus?: 'DELIVERED' | 'PENDING';
} & NotificationContent;

async function channelEnabled(
  tx: Prisma.TransactionClient, companyId: string, userId: string, channel: NotificationChannel,
): Promise<boolean> {
  const preference = await tx.notificationPreference.findUnique({
    where: { companyId_userId: { companyId, userId } },
    select: { inAppEnabled: true, smsEnabled: true, emailEnabled: true },
  });
  if (!preference) return true;
  if (channel === 'SMS') return preference.smsEnabled;
  if (channel === 'EMAIL') return preference.emailEnabled;
  return preference.inAppEnabled;
}

/**
 * NTF-01 (D-068): stores a notification for a recipient inside the caller's
 * governed transaction, so the event and its notification commit atomically.
 * Returns false when suppressed (own action, preference off, or duplicate
 * event). "Delivered" for the in-app channel means stored in the inbox.
 */
export async function notifyUserInTransaction(
  tx: Prisma.TransactionClient, input: NotifyInput,
): Promise<boolean> {
  const channel = input.channel ?? 'IN_APP';
  if (input.actorId && input.actorId === input.userId) return false;
  if (!(await channelEnabled(tx, input.companyId, input.userId, channel))) return false;
  const existing = await tx.notification.findUnique({
    where: {
      companyId_userId_channel_dedupeKey: {
        companyId: input.companyId, userId: input.userId, channel, dedupeKey: input.dedupeKey,
      },
    },
    select: { id: true },
  });
  if (existing) return false;
  try {
    await tx.notification.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        channel,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        dedupeKey: input.dedupeKey,
        status: input.initialStatus ?? 'DELIVERED',
        destination: input.destination ?? null,
      },
      select: { id: true },
    });
    return true;
  } catch (error) {
    // A concurrent delivery of the same event won the race: a duplicate.
    if (typeof error === 'object' && error !== null && 'code' in error
      && (error as { code?: unknown }).code === 'P2002') return false;
    throw error;
  }
}

/** Resolves the linked passenger login for an employee, if any, and notifies. */
export async function notifyLinkedEmployee(
  tx: Prisma.TransactionClient,
  input: Omit<NotifyInput, 'userId'> & { employeeId: string },
): Promise<boolean> {
  const employee = await tx.employee.findUnique({
    where: { id: input.employeeId }, select: { userId: true, telephone: true },
  });
  if (!employee?.userId) return false;
  const { employeeId: _employeeId, ...rest } = input;
  const delivered = await notifyUserInTransaction(tx, { ...rest, userId: employee.userId });
  if (employee.telephone) {
    // NTF-02 (D-069): queue the SMS copy; the dispatcher sends it later and
    // only a provider confirmation may call it delivered.
    await notifyUserInTransaction(tx, {
      ...rest,
      userId: employee.userId,
      channel: 'SMS',
      destination: employee.telephone,
      dedupeKey: `${rest.dedupeKey}:sms`,
      initialStatus: 'PENDING',
    });
  }
  return delivered;
}

/** Resolves the linked rental-customer login for a customer, if any. */
export async function notifyLinkedCustomer(
  tx: Prisma.TransactionClient,
  input: Omit<NotifyInput, 'userId'> & { customerId: string },
): Promise<boolean> {
  const customer = await tx.customer.findUnique({
    where: { id: input.customerId }, select: { userId: true, telephone: true },
  });
  if (!customer?.userId) return false;
  const { customerId: _customerId, ...rest } = input;
  const delivered = await notifyUserInTransaction(tx, { ...rest, userId: customer.userId });
  if (customer.telephone) {
    await notifyUserInTransaction(tx, {
      ...rest,
      userId: customer.userId,
      channel: 'SMS',
      destination: customer.telephone,
      dedupeKey: `${rest.dedupeKey}:sms`,
      initialStatus: 'PENDING',
    });
  }
  return delivered;
}

export type OwnNotification = {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type OwnSmsDelivery = {
  notificationId: string;
  type: string;
  title: string;
  destination: string | null;
  status: string;
  attempts: number;
  createdAt: Date;
};

export type NotificationPreferences = {
  inAppEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
};

async function assertCompany(companyId: string) {
  const company = await getPrisma().company.findUnique({
    where: { id: companyId }, select: { status: true },
  });
  if (company?.status !== 'ACTIVE') throw new NotificationCompanyNotFoundError();
}

/** NTF-01: the caller's own inbox (never anyone else's) plus unread count. */
export async function listOwnNotifications(input: { userId: string; companyId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  await assertCompany(companyId);
  const prisma = getPrisma();
  const [rows, unreadCount, totalCount, smsRows] = await Promise.all([
    prisma.notification.findMany({
      where: { companyId, userId: input.userId, channel: 'IN_APP' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        id: true, type: true, title: true, body: true,
        entityType: true, entityId: true, readAt: true, createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { companyId, userId: input.userId, channel: 'IN_APP', readAt: null },
    }),
    prisma.notification.count({
      where: { companyId, userId: input.userId, channel: 'IN_APP' },
    }),
    prisma.notification.findMany({
      where: { companyId, userId: input.userId, channel: 'SMS' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        id: true, type: true, title: true, destination: true,
        status: true, attempts: true, createdAt: true,
      },
    }),
  ]);
  const notifications: OwnNotification[] = rows.map((row) => ({
    notificationId: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    readAt: row.readAt,
    createdAt: row.createdAt,
  }));
  const smsDeliveries: OwnSmsDelivery[] = smsRows.map((row) => ({
    notificationId: row.id,
    type: row.type,
    title: row.title,
    destination: row.destination,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.createdAt,
  }));
  return { companyId, notifications, unreadCount, totalCount, smsDeliveries };
}

/** NTF-01: counts only, for the workspace bell. */
export async function countOwnUnread(input: { userId: string; companyId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  return getPrisma().notification.count({
    where: { companyId, userId: input.userId, channel: 'IN_APP', readAt: null },
  });
}

export async function markNotificationRead(input: {
  userId: string; companyId: string; notificationId: string;
}) {
  const companyId = companyIdSchema.parse(input.companyId);
  const notificationId = idSchema.parse(input.notificationId);
  await assertCompany(companyId);
  const prisma = getPrisma();
  const changed = await prisma.notification.updateMany({
    where: { id: notificationId, companyId, userId: input.userId, readAt: null },
    data: { readAt: new Date() },
  });
  if (changed.count === 0) {
    const exists = await prisma.notification.findFirst({
      where: { id: notificationId, companyId, userId: input.userId },
      select: { id: true },
    });
    if (!exists) throw new NotificationNotFoundError();
  }
  return { notificationId, read: true };
}

export async function markAllNotificationsRead(input: { userId: string; companyId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  await assertCompany(companyId);
  const result = await getPrisma().notification.updateMany({
    where: { companyId, userId: input.userId, channel: 'IN_APP', readAt: null },
    data: { readAt: new Date() },
  });
  return { markedRead: result.count };
}

export async function getOwnPreferences(input: {
  userId: string; companyId: string;
}): Promise<NotificationPreferences> {
  const companyId = companyIdSchema.parse(input.companyId);
  await assertCompany(companyId);
  const preference = await getPrisma().notificationPreference.findUnique({
    where: { companyId_userId: { companyId, userId: input.userId } },
    select: { inAppEnabled: true, smsEnabled: true, emailEnabled: true },
  });
  return preference ?? { inAppEnabled: true, smsEnabled: true, emailEnabled: true };
}

export async function updateOwnPreferences(
  input: unknown, userId: string, companyIdInput: string,
): Promise<NotificationPreferences> {
  const companyId = companyIdSchema.parse(companyIdInput);
  const data = notificationPreferencesSchema.parse(input);
  await assertCompany(companyId);
  const preference = await getPrisma().notificationPreference.upsert({
    where: { companyId_userId: { companyId, userId } },
    create: { companyId, userId, ...data },
    update: { ...data },
    select: { inAppEnabled: true, smsEnabled: true, emailEnabled: true },
  });
  return preference;
}

// Template renderers re-exported for the wiring modules.
export {
  bookingAssignedNotification,
  bookingCreatedNotification,
  bookingStatusNotification,
  rentalStatusNotification,
};
