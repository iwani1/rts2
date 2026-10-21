import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { notifyUserInTransaction } from '@/modules/notifications/notifications';

export class ServicePlanCompanyNotFoundError extends Error {
  constructor() { super('Company not found.'); this.name = 'ServicePlanCompanyNotFoundError'; }
}
export class ServicePlanValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ServicePlanValidationError'; }
}

const companyIdSchema = z.string().trim().min(1).max(128);

/** D-075: reminder thresholds. */
export const SERVICE_DUE_SOON_DAYS = 14;
export const SERVICE_DUE_SOON_KM = 500;

export type ServiceReminderStatus = 'OVERDUE' | 'DUE_SOON' | 'OK' | 'NO_PLAN';

export type ServiceReminder = {
  vehicleId: string;
  registrationNumber: string;
  status: ServiceReminderStatus;
  hasPlan: boolean;
  dueDate: string | null;
  daysRemaining: number | null;
  dueOdometerKm: number | null;
  kmRemaining: number | null;
  lastServiceDate: string | null;
};

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function wholeDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((end - start) / 86_400_000);
}

/**
 * Pure reminder computation (D-075): a passed date never completes
 * maintenance — it only makes the vehicle overdue until a service is
 * recorded. Exported for unit tests.
 */
export function computeServiceReminder(input: {
  intervalDays: number | null;
  intervalKm: number | null;
  lastServiceDate: Date | null;
  lastServiceOdometerKm: number | null;
  storedNextServiceAt: Date | null;
  currentOdometerKm: number | null;
  today: Date;
}): Omit<ServiceReminder, 'vehicleId' | 'registrationNumber' | 'hasPlan' | 'lastServiceDate'> {
  let dueDate: Date | null = null;
  if (input.intervalDays !== null && input.lastServiceDate !== null) {
    dueDate = addDays(input.lastServiceDate, input.intervalDays);
  } else if (input.storedNextServiceAt !== null) {
    dueDate = input.storedNextServiceAt;
  }
  let dueOdometerKm: number | null = null;
  if (input.intervalKm !== null && input.lastServiceOdometerKm !== null) {
    dueOdometerKm = input.lastServiceOdometerKm + input.intervalKm;
  }
  const daysRemaining = dueDate ? wholeDaysBetween(input.today, dueDate) : null;
  const kmRemaining = dueOdometerKm !== null && input.currentOdometerKm !== null
    ? dueOdometerKm - input.currentOdometerKm
    : null;

  const hasPlan = input.intervalDays !== null || input.intervalKm !== null;
  let status: ServiceReminderStatus;
  if (!hasPlan && !dueDate) {
    status = 'NO_PLAN';
  } else if ((daysRemaining !== null && daysRemaining < 0) || (kmRemaining !== null && kmRemaining <= 0)) {
    status = 'OVERDUE';
  } else if (
    (daysRemaining !== null && daysRemaining <= SERVICE_DUE_SOON_DAYS)
    || (kmRemaining !== null && kmRemaining <= SERVICE_DUE_SOON_KM)
  ) {
    status = 'DUE_SOON';
  } else {
    status = 'OK';
  }
  return {
    status,
    dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
    daysRemaining,
    dueOdometerKm,
    kmRemaining,
  };
}

async function accessFor(actorId: string, companyId: string) {
  const permission = await resolvePermission({ userId: actorId, companyId, permission: 'maintenance:manage' });
  if (!permission.allowed) throw new PermissionDeniedError();
  if (!(permission.scopes.includes('GLOBAL') || permission.scopes.includes('COMPANY'))) {
    throw new PermissionDeniedError();
  }
  const company = await getPrisma().company.findUnique({ where: { id: companyId }, select: { status: true } });
  if (company?.status !== 'ACTIVE') throw new ServicePlanCompanyNotFoundError();
}

const planSchema = z.object({
  vehicleId: z.string().trim().min(1).max(128),
  intervalDays: z.number().int().positive().max(3650).nullable(),
  intervalKm: z.number().int().positive().max(1_000_000).nullable(),
  lastServiceDate: z.string().date(),
  lastServiceOdometerKm: z.number().finite().nonnegative().max(9_999_999_999).nullable(),
  reason: z.string().trim().min(8).max(500),
}).strict().refine((data) => data.intervalDays !== null || data.intervalKm !== null, {
  message: 'Give the plan a calendar interval, a mileage interval, or both.',
});

const recordServiceSchema = z.object({
  vehicleId: z.string().trim().min(1).max(128),
  serviceDate: z.string().date(),
  odometerKm: z.number().finite().nonnegative().max(9_999_999_999).nullable(),
  reason: z.string().trim().min(8).max(500),
}).strict();

function nextServiceDate(lastServiceDate: Date, intervalDays: number | null): Date | null {
  return intervalDays !== null ? addDays(lastServiceDate, intervalDays) : null;
}

/** MNT-03: create or replace a vehicle's preventive-service plan. */
export async function upsertServicePlan(input: unknown, actorId: string, companyIdInput: string) {
  const data = planSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const vehicle = await tx.vehicle.findFirst({
      where: { id: data.vehicleId, companyId, archivedAt: null },
      select: { id: true, registrationNumber: true },
    });
    if (!vehicle) throw new ServicePlanValidationError('Vehicle not found in this company.');
    const lastServiceDate = new Date(`${data.lastServiceDate}T00:00:00.000Z`);
    const plan = await tx.vehicleServicePlan.upsert({
      where: { companyId_vehicleId: { companyId, vehicleId: vehicle.id } },
      create: {
        companyId, vehicleId: vehicle.id,
        intervalDays: data.intervalDays, intervalKm: data.intervalKm,
        lastServiceDate, lastServiceOdometerKm: data.lastServiceOdometerKm,
      },
      update: {
        intervalDays: data.intervalDays, intervalKm: data.intervalKm,
        lastServiceDate, lastServiceOdometerKm: data.lastServiceOdometerKm,
      },
    });
    const next = nextServiceDate(lastServiceDate, data.intervalDays);
    if (next) {
      await tx.vehicle.update({
        where: { id: vehicle.id }, data: { nextServiceAt: next },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'VEHICLE_SERVICE_PLAN_SAVED', entityType: 'VEHICLE', entityId: vehicle.id,
        summary: {
          registrationNumber: vehicle.registrationNumber,
          intervalDays: data.intervalDays, intervalKm: data.intervalKm,
          lastServiceDate: data.lastServiceDate, reason: data.reason,
        },
      },
    });
    return plan;
  });
}

/**
 * MNT-03: record that a service actually happened. This is the only way a
 * baseline moves — a passed due date never completes maintenance (D-075).
 */
export async function recordVehicleService(input: unknown, actorId: string, companyIdInput: string) {
  const data = recordServiceSchema.parse(input);
  const companyId = companyIdSchema.parse(companyIdInput);
  await accessFor(actorId, companyId);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const vehicle = await tx.vehicle.findFirst({
      where: { id: data.vehicleId, companyId, archivedAt: null },
      select: { id: true, registrationNumber: true, servicePlan: { select: { intervalDays: true } } },
    });
    if (!vehicle) throw new ServicePlanValidationError('Vehicle not found in this company.');
    const serviceDate = new Date(`${data.serviceDate}T00:00:00.000Z`);
    const plan = await tx.vehicleServicePlan.upsert({
      where: { companyId_vehicleId: { companyId, vehicleId: vehicle.id } },
      create: {
        companyId, vehicleId: vehicle.id, intervalDays: null, intervalKm: null,
        lastServiceDate: serviceDate, lastServiceOdometerKm: data.odometerKm,
      },
      update: { lastServiceDate: serviceDate, lastServiceOdometerKm: data.odometerKm },
    });
    const next = nextServiceDate(serviceDate, plan.intervalDays);
    await tx.vehicle.update({
      where: { id: vehicle.id },
      data: {
        ...(next ? { nextServiceAt: next } : {}),
        ...(data.odometerKm !== null
          ? { odometerValue: data.odometerKm, odometerUnit: 'KM' }
          : {}),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId, companyId, action: 'VEHICLE_SERVICE_RECORDED', entityType: 'VEHICLE', entityId: vehicle.id,
        summary: {
          registrationNumber: vehicle.registrationNumber,
          serviceDate: data.serviceDate, odometerKm: data.odometerKm, reason: data.reason,
        },
      },
    });
    return plan;
  });
}

/** The reminder register: every active vehicle with its computed state. */
export async function listServiceReminders(input: { actorId: string; companyId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  await accessFor(input.actorId, companyId);
  const prisma = getPrisma();
  const vehicles = await prisma.vehicle.findMany({
    where: { companyId, archivedAt: null },
    orderBy: { registrationNumber: 'asc' },
    take: 200,
    select: {
      id: true, registrationNumber: true, odometerValue: true, odometerUnit: true,
      nextServiceAt: true,
      servicePlan: {
        select: { intervalDays: true, intervalKm: true, lastServiceDate: true, lastServiceOdometerKm: true },
      },
    },
  });
  const today = new Date();
  const reminders: ServiceReminder[] = vehicles.map((vehicle) => {
    const plan = vehicle.servicePlan;
    const computed = computeServiceReminder({
      intervalDays: plan?.intervalDays ?? null,
      intervalKm: plan?.intervalKm ?? null,
      lastServiceDate: plan?.lastServiceDate ?? null,
      lastServiceOdometerKm: plan?.lastServiceOdometerKm !== null && plan?.lastServiceOdometerKm !== undefined
        ? Number(plan.lastServiceOdometerKm)
        : null,
      storedNextServiceAt: vehicle.nextServiceAt,
      currentOdometerKm: vehicle.odometerUnit === 'MILE'
        ? null
        : (vehicle.odometerValue !== null ? Number(vehicle.odometerValue) : null),
      today,
    });
    return {
      vehicleId: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      hasPlan: Boolean(plan),
      lastServiceDate: plan ? plan.lastServiceDate.toISOString().slice(0, 10) : null,
      ...computed,
    };
  });
  const rank: Record<ServiceReminderStatus, number> = { OVERDUE: 0, DUE_SOON: 1, OK: 2, NO_PLAN: 3 };
  reminders.sort((a, b) => rank[a.status] - rank[b.status]
    || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  return { reminders };
}

/**
 * Alerts maintenance managers about overdue/due-soon vehicles. Explicit
 * action only — no scheduler is pretended (D-075). Dedupe per vehicle,
 * due date and severity keeps repeat presses quiet.
 */
export async function notifyServiceReminders(input: { actorId: string; companyId: string }) {
  const companyId = companyIdSchema.parse(input.companyId);
  await accessFor(input.actorId, companyId);
  const { reminders } = await listServiceReminders(input);
  const urgent = reminders.filter((row) => row.status === 'OVERDUE' || row.status === 'DUE_SOON');
  const prisma = getPrisma();
  let notifiedUsers = 0;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const assignments = await tx.userRoleAssignment.findMany({
      where: {
        companyId, revokedAt: null,
        role: { grants: { some: { permission: 'maintenance:manage', scope: { in: ['GLOBAL', 'COMPANY'] } } } },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    for (const reminder of urgent) {
      for (const assignment of assignments) {
        const delivered = await notifyUserInTransaction(tx, {
          companyId,
          userId: assignment.userId,
          actorId: input.actorId,
          type: 'SERVICE_REMINDER',
          title: `Service ${reminder.status === 'OVERDUE' ? 'overdue' : 'due soon'}: ${reminder.registrationNumber}`,
          body: reminder.dueDate
            ? `Service was due ${reminder.dueDate}. A passed date does not complete maintenance — record the service when it is done.`
            : 'Service is due by mileage. Record the service when it is done.',
          entityType: 'VEHICLE',
          entityId: reminder.vehicleId,
          dedupeKey: `service-reminder:${reminder.vehicleId}:${reminder.dueDate ?? 'km'}:${reminder.status}`,
        });
        if (delivered) notifiedUsers += 1;
      }
    }
  });
  return { vehicles: urgent.length, notifiedUsers };
}
