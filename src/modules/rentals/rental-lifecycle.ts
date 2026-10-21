import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PermissionDeniedError, resolvePermission } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { notifyLinkedCustomer, rentalStatusNotification } from '@/modules/notifications/notifications';
import { getCompanyDepositPolicy, getCompanyResourceBuffers } from '@/modules/settings/registry';
import { isAllowedRentalRequestTransition } from './rental-request-transitions';
import {
  buildRentalConflictWindow,
  conflictWindowsOverlapWithBuffer,
  type RentalConflictWindow,
} from './resource-conflict-window';

/**
 * Phase 4 (D-089): the rental confirmation -> assignment -> completion /
 * cancellation chain. Every write follows the same guarded shape as the
 * Phase 1B transitions: access -> input -> transaction { locked read ->
 * transition matrix -> preconditions -> side effects -> guarded status
 * write -> status history -> audit -> linked-customer notification }.
 * The RentalAssignment ledger plus the PostgreSQL exclusion constraints
 * make double-booking impossible; the configured resource buffers are
 * evaluated on top (D-031/D-033), fail closed when unset.
 */

export class RentalLifecycleNotFoundError extends Error {
  readonly code = 'RENTAL_NOT_FOUND';
  readonly statusCode = 404;
  constructor(message = 'The rental request or resource was not found in this workspace.') {
    super(message);
    this.name = 'RentalLifecycleNotFoundError';
  }
}

export class RentalLifecycleTransitionError extends Error {
  readonly code = 'RENTAL_TRANSITION_NOT_ALLOWED';
  readonly statusCode = 409;
  constructor(message = 'This rental status change is not allowed.') {
    super(message);
    this.name = 'RentalLifecycleTransitionError';
  }
}

export class RentalLifecyclePolicyError extends Error {
  readonly code: string;
  readonly statusCode = 422;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RentalLifecyclePolicyError';
    this.code = code;
  }
}

export class RentalConflictError extends Error {
  readonly code = 'RENTAL_RESOURCE_CONFLICT';
  readonly statusCode = 409;
  constructor(message = 'The selected resource is already committed to another rental in that window (including the configured buffer).') {
    super(message);
    this.name = 'RentalConflictError';
  }
}

export function rentalLifecycleErrorStatus(error: unknown): number {
  if (error instanceof z.ZodError) return 400;
  if (error instanceof Error && error.name === 'PermissionDeniedError') return 403;
  if (error instanceof RentalLifecycleNotFoundError) return 404;
  if (
    error instanceof RentalLifecycleTransitionError
    || error instanceof RentalConflictError
  ) return 409;
  if (error instanceof RentalLifecyclePolicyError) return 422;
  return 500;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestampSchema = z.string().min(10).max(40);

export const confirmRentalSchema = z.object({
  vehicleId: z.string().min(1).max(64),
  acceptedByName: z.string().trim().min(2).max(200),
  acceptanceAt: dateSchema,
  acceptanceReference: z.string().trim().min(2).max(200),
  depositReceivedPesewas: z.number().int().min(0).max(2_147_483_647).optional().nullable(),
  depositEvidenceReference: z.string().trim().min(2).max(200).optional().nullable(),
  reason: z.string().trim().min(8).max(500),
});
export type ConfirmRentalInput = z.infer<typeof confirmRentalSchema>;

export const assignDriverSchema = z.object({
  driverId: z.string().min(1).max(64),
});

export const reassignVehicleSchema = z.object({
  vehicleId: z.string().min(1).max(64),
  reason: z.string().trim().min(8).max(500),
});

export const submitCompletionSchema = z.object({
  actualDepartureAt: timestampSchema,
  actualReturnAt: timestampSchema,
  vehicleReturnedAt: timestampSchema,
  actualDistanceMetres: z.number().int().min(0).max(50_000_000).optional().nullable(),
  damageNotes: z.string().trim().max(500).optional().nullable(),
  customerFeedback: z.string().trim().max(500).optional().nullable(),
  depositReceivedPesewas: z.number().int().min(0).max(2_147_483_647),
  additionalChargesPesewas: z.number().int().min(0).max(2_147_483_647),
  chargesDescription: z.string().trim().max(500).default(''),
});

export const decideCompletionSchema = z.object({
  decision: z.enum(['APPROVE', 'RETURN']),
  reason: z.string().trim().min(8).max(500),
  correctedChargesPesewas: z.number().int().min(0).max(2_147_483_647).optional().nullable(),
});

export const cancelRentalSchema = z.object({
  reason: z.string().trim().min(8).max(500),
});

type Tx = Prisma.TransactionClient;

function auditInput(input: {
  companyId: string; actorId: string; entityType: string; entityId: string;
  action: string; details?: Record<string, unknown>;
}) {
  return input;
}

async function writeAuditEvent(tx: Tx, input: ReturnType<typeof auditInput>) {
  await tx.auditEvent.create({
    data: {
      actorId: input.actorId,
      companyId: input.companyId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: (input.details ?? {}) as Prisma.InputJsonValue,
    },
  });
}

async function requireManage(actorId: string, companyId: string) {
  const access = await resolvePermission({ userId: actorId, companyId, permission: 'rental:manage' });
  if (!access.allowed) throw new PermissionDeniedError();
  return access;
}

async function requireRead(actorId: string, companyId: string) {
  for (const permission of ['rental:read', 'rental:manage'] as const) {
    const access = await resolvePermission({ userId: actorId, companyId, permission });
    if (access.allowed) return access;
  }
  throw new PermissionDeniedError();
}

async function loadRequest(tx: Tx, companyId: string, requestId: string) {
  const request = await tx.rentalRequest.findFirst({ where: { id: requestId, companyId } });
  if (!request) throw new RentalLifecycleNotFoundError();
  return request;
}

async function transitionStatus(
  tx: Tx,
  input: {
    request: { id: string; companyId: string; customerId: string; status: string; pickupLocation: string | null; destination: string | null; serviceDate: Date | null };
    toStatus: string;
    actorId: string;
    reason: string;
    auditAction: string;
    auditDetails?: Record<string, unknown>;
  },
) {
  const { request, toStatus } = input;
  if (!isAllowedRentalRequestTransition(request.status, toStatus)) {
    throw new RentalLifecycleTransitionError(
      `Rental request cannot move from "${request.status}" to "${toStatus}".`,
    );
  }
  const updated = await tx.rentalRequest.updateMany({
    where: { id: request.id, companyId: request.companyId, status: request.status },
    data: { status: toStatus },
  });
  if (updated.count !== 1) {
    throw new RentalLifecycleTransitionError('The rental request changed while it was being processed. Please refresh and review it again.');
  }
  const history = await tx.rentalRequestStatusHistory.create({
    data: {
      companyId: request.companyId,
      requestId: request.id,
      actorId: input.actorId,
      fromStatus: request.status,
      toStatus,
      reason: input.reason,
    },
  });
  await writeAuditEvent(tx, auditInput({
    companyId: request.companyId,
    actorId: input.actorId,
    entityType: 'RentalRequest',
    entityId: request.id,
    action: input.auditAction,
    details: input.auditDetails ?? {},
  }));
  const content = rentalStatusNotification(
    {
      pickupLocation: request.pickupLocation,
      destination: request.destination,
      serviceDate: request.serviceDate ? request.serviceDate.toISOString().slice(0, 10) : null,
    },
    toStatus,
  );
  await notifyLinkedCustomer(tx, {
    customerId: request.customerId,
    companyId: request.companyId,
    type: 'RENTAL_STATUS_CHANGED',
    title: content.title,
    body: content.body,
    entityType: 'RentalRequest',
    entityId: request.id,
    dedupeKey: `rental-history:${history.id}`,
  });
}

async function activeAssignment(tx: Tx, companyId: string, requestId: string) {
  return tx.rentalAssignment.findFirst({
    where: { companyId, requestId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
}

async function assertVehicleUsable(
  tx: Tx,
  input: { companyId: string; vehicleId: string; passengerCount: number | null },
) {
  const vehicle = await tx.vehicle.findFirst({
    where: { id: input.vehicleId, companyId: input.companyId },
    select: { id: true, archivedAt: true, seatCount: true },
  });
  if (!vehicle) throw new RentalLifecycleNotFoundError('The selected vehicle was not found.');
  if (vehicle.archivedAt) {
    throw new RentalLifecyclePolicyError('RNT_VEHICLE_ARCHIVED', 'The selected vehicle is archived and cannot be assigned.');
  }
  if (input.passengerCount !== null && vehicle.seatCount !== null && vehicle.seatCount < input.passengerCount) {
    throw new RentalLifecyclePolicyError(
      'RNT_VEHICLE_CAPACITY',
      `The selected vehicle seats ${vehicle.seatCount}, fewer than the ${input.passengerCount} passengers on this booking.`,
    );
  }
  const block = await tx.vehicleSafetyBlock.findFirst({
    where: { companyId: input.companyId, vehicleId: input.vehicleId, releasedAt: null },
    select: { id: true },
  });
  if (block) {
    throw new RentalLifecyclePolicyError('RNT_VEHICLE_SAFETY_BLOCK', 'The selected vehicle has an active safety block and cannot be assigned until the block is released.');
  }
  return vehicle;
}

async function assertNoResourceConflict(
  tx: Tx,
  input: {
    companyId: string;
    resource: 'vehicleId' | 'driverId';
    resourceId: string;
    window: RentalConflictWindow;
    bufferMinutes: number | null;
    excludeAssignmentId?: string;
  },
): Promise<void> {
  if (input.bufferMinutes === null) {
    throw new RentalLifecyclePolicyError(
      'RNT_BUFFER_NOT_CONFIGURED',
      `The ${input.resource === 'vehicleId' ? 'vehicle' : 'driver'} turnaround buffer is not configured under Settings; resource conflicts cannot be evaluated. Configure the vehicle/driver between-job buffers (fleet.vehicle_between_job_buffer_minutes / fleet.driver_between_job_buffer_minutes) in Admin settings and retry.`,
    );
  }
  const others = await tx.rentalAssignment.findMany({
    where: {
      companyId: input.companyId,
      status: 'ACTIVE',
      [input.resource]: input.resourceId,
      ...(input.excludeAssignmentId ? { id: { not: input.excludeAssignmentId } } : {}),
    },
    select: { startsAt: true, endsAt: true },
  });
  for (const other of others) {
    const buffered = conflictWindowsOverlapWithBuffer(input.window, { startAt: other.startsAt, endAt: other.endsAt }, input.bufferMinutes);
    if (!buffered.ready) throw new RentalLifecyclePolicyError('RNT_BUFFER_INVALID', 'The configured resource buffer is invalid.');
    if (buffered.conflict) {
      throw new RentalConflictError();
    }
  }
}

async function createAssignment(
  tx: Tx,
  input: {
    companyId: string;
    requestId: string;
    vehicleId: string | null;
    driverId: string | null;
    window: RentalConflictWindow;
    actorId: string;
    excludeAssignmentId?: string;
    buffers: { vehicleBufferMinutes: number | null; driverBufferMinutes: number | null };
  },
) {
  if (input.vehicleId) {
    await assertNoResourceConflict(tx, {
      companyId: input.companyId, resource: 'vehicleId', resourceId: input.vehicleId,
      window: input.window, bufferMinutes: input.buffers.vehicleBufferMinutes,
      excludeAssignmentId: input.excludeAssignmentId,
    });
  }
  if (input.driverId) {
    await assertNoResourceConflict(tx, {
      companyId: input.companyId, resource: 'driverId', resourceId: input.driverId,
      window: input.window, bufferMinutes: input.buffers.driverBufferMinutes,
      excludeAssignmentId: input.excludeAssignmentId,
    });
  }
  try {
    return await tx.rentalAssignment.create({
      data: {
        companyId: input.companyId,
        requestId: input.requestId,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        startsAt: input.window.startAt,
        endsAt: input.window.endAt,
        createdById: input.actorId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/no_overlap|exclusion/i.test(message)) throw new RentalConflictError();
    throw error;
  }
}

async function releaseActiveAssignments(tx: Tx, companyId: string, requestId: string, kind: string, now: Date) {
  await tx.rentalAssignment.updateMany({
    where: { companyId, requestId, status: 'ACTIVE' },
    data: { status: 'RELEASED', releasedAt: now, releaseKind: kind },
  });
}

function requestWindow(request: {
  serviceDate: Date | null; departureTime: string | null; returnTime: string | null;
  returnDate: Date | null; durationMinutes: number | null;
}): RentalConflictWindow {
  const window = buildRentalConflictWindow({
    serviceDate: request.serviceDate ? request.serviceDate.toISOString().slice(0, 10) : null,
    departureTime: request.departureTime,
    returnTime: request.returnTime,
    returnDate: request.returnDate ? request.returnDate.toISOString().slice(0, 10) : null,
    durationMinutes: request.durationMinutes,
  });
  if (!window.ready) {
    throw new RentalLifecyclePolicyError(
      `RNT_WINDOW_${window.reason}`,
      `The booking window cannot be computed (${window.reason.toLowerCase().replace(/_/g, ' ')}). Complete the service date and departure/return times on the request before confirming.`,
    );
  }
  return window.window;
}

// ---------------------------------------------------------------- RNT-05

export async function confirmRentalRequest(actorId: string, companyId: string, requestId: string, rawInput: ConfirmRentalInput) {
  await requireManage(actorId, companyId);
  const input = confirmRentalSchema.parse(rawInput);
  const depositPolicy = await getCompanyDepositPolicy(companyId);
  const buffers = await getCompanyResourceBuffers(companyId);
  const now = new Date();
  const result = await getPrisma().$transaction(async (tx) => {
    const request = await loadRequest(tx, companyId, requestId);
    if (!isAllowedRentalRequestTransition(request.status, 'Confirmed')) {
      throw new RentalLifecycleTransitionError(`Rental request cannot move from "${request.status}" to "Confirmed".`);
    }
    const worksheet = await tx.rentalPricingWorksheet.findFirst({
      where: { companyId, requestId },
      orderBy: { version: 'desc' },
    });
    if (!worksheet) {
      throw new RentalLifecyclePolicyError('RNT_NO_WORKSHEET', 'A pricing worksheet is required before this rental can be confirmed.');
    }
    if (!depositPolicy) {
      throw new RentalLifecyclePolicyError('RNT_DEPOSIT_POLICY_NOT_CONFIGURED', 'The rental deposit policy is not configured under Settings. Configure rental.deposit_policy and retry.');
    }
    const subtotal = worksheet.preTaxSubtotalPesewas;
    let depositDue = 0;
    let collectionStage: 'BEFORE_CONFIRMATION' | 'BEFORE_DEPARTURE' | null = null;
    if (depositPolicy.kind === 'FIXED_AMOUNT') {
      depositDue = depositPolicy.amountPesewas;
      collectionStage = depositPolicy.collectionStage;
    }
    if (depositPolicy.kind === 'PERCENTAGE') {
      const basisPoints = BigInt(depositPolicy.rateBasisPoints);
      depositDue = Number((subtotal * basisPoints + BigInt(9999)) / BigInt(10000));
      collectionStage = depositPolicy.collectionStage;
    }
    const received = input.depositReceivedPesewas ?? 0;
    if (collectionStage === 'BEFORE_CONFIRMATION') {
      if (received < depositDue) {
        throw new RentalLifecyclePolicyError('RNT_DEPOSIT_NOT_RECEIVED', `The deposit policy requires ${depositDue} pesewas before confirmation; ${received} pesewas recorded.`);
      }
      if (depositDue > 0 && !input.depositEvidenceReference) {
        throw new RentalLifecyclePolicyError('RNT_DEPOSIT_EVIDENCE_REQUIRED', 'Record the deposit evidence reference (receipt or payment reference) before confirming.');
      }
    } else if (received > 0 && !input.depositEvidenceReference) {
      throw new RentalLifecyclePolicyError('RNT_DEPOSIT_EVIDENCE_REQUIRED', 'A deposit was recorded; record its evidence reference.');
    }
    await assertVehicleUsable(tx, { companyId, vehicleId: input.vehicleId, passengerCount: request.passengerCount });
    const window = requestWindow(request);
    const assignment = await createAssignment(tx, {
      companyId, requestId, vehicleId: input.vehicleId, driverId: null, window,
      actorId, buffers,
    });
    await tx.rentalRequest.update({
      where: { id: request.id },
      data: {
        acceptedByName: input.acceptedByName,
        acceptanceAt: new Date(`${input.acceptanceAt}T00:00:00.000Z`),
        acceptanceReference: input.acceptanceReference,
        confirmedWorksheetId: worksheet.id,
        depositDuePesewas: depositDue,
        depositReceivedPesewas: received,
        depositEvidenceReference: input.depositEvidenceReference ?? null,
      },
    });
    await transitionStatus(tx, {
      request, toStatus: 'Confirmed', actorId, reason: input.reason,
      auditAction: 'RENTAL_REQUEST_CONFIRMED',
      auditDetails: {
        vehicleId: input.vehicleId, assignmentId: assignment.id,
        worksheetId: worksheet.id, worksheetVersion: worksheet.version,
        depositDuePesewas: depositDue, depositReceivedPesewas: received,
        acceptedByName: input.acceptedByName, acceptanceReference: input.acceptanceReference,
      },
    });
    return { assignmentId: assignment.id, depositDuePesewas: depositDue, depositReceivedPesewas: received };
  });
  void now;
  return result;
}

// ---------------------------------------------------------------- RNT-06

export async function assignRentalDriver(actorId: string, companyId: string, requestId: string, rawInput: { driverId: string }) {
  await requireManage(actorId, companyId);
  const input = assignDriverSchema.parse(rawInput);
  const buffers = await getCompanyResourceBuffers(companyId);
  return getPrisma().$transaction(async (tx) => {
    const request = await loadRequest(tx, companyId, requestId);
    if (request.status !== 'Confirmed' && request.status !== 'Assigned') {
      throw new RentalLifecycleTransitionError(`A driver can only be assigned to a Confirmed or Assigned rental (current: "${request.status}").`);
    }
    const current = await activeAssignment(tx, companyId, requestId);
    if (!current) {
      throw new RentalLifecyclePolicyError('RNT_NO_ACTIVE_ASSIGNMENT', 'This rental has no active reservation to attach the driver to. Confirm it with a vehicle first.');
    }
    const driver = await tx.driver.findFirst({
      where: { id: input.driverId, companyId },
      select: { id: true, status: true, archivedAt: true },
    });
    if (!driver) throw new RentalLifecycleNotFoundError('The selected driver was not found.');
    if (driver.archivedAt || driver.status !== 'ACTIVE') {
      throw new RentalLifecyclePolicyError('RNT_DRIVER_NOT_ACTIVE', 'The selected driver is not active and cannot be assigned.');
    }
    const window: RentalConflictWindow = { startAt: current.startsAt, endAt: current.endsAt };
    // Retire the current row BEFORE inserting its replacement: the database
    // exclusion constraints evaluate against ACTIVE rows, so the old row
    // would otherwise conflict with its own replacement in the same window.
    // The transaction rolls this update back if the replacement fails.
    await tx.rentalAssignment.update({
      where: { id: current.id },
      data: { status: 'REPLACED', releasedAt: new Date(), releaseKind: 'REASSIGNMENT' },
    });
    const replacement = await createAssignment(tx, {
      companyId, requestId, vehicleId: current.vehicleId, driverId: input.driverId,
      window, actorId, buffers, excludeAssignmentId: current.id,
    });
    if (request.status === 'Confirmed') {
      await transitionStatus(tx, {
        request, toStatus: 'Assigned', actorId, reason: 'Driver assigned',
        auditAction: 'RENTAL_REQUEST_DRIVER_ASSIGNED',
        auditDetails: { driverId: input.driverId, assignmentId: replacement.id, replacedAssignmentId: current.id },
      });
    } else {
      await writeAuditEvent(tx, auditInput({
        companyId, actorId, entityType: 'RentalRequest', entityId: request.id,
        action: 'RENTAL_REQUEST_DRIVER_REASSIGNED',
        details: { driverId: input.driverId, assignmentId: replacement.id, replacedAssignmentId: current.id, previousDriverId: current.driverId },
      }));
    }
    return { assignmentId: replacement.id };
  });
}

export async function reassignRentalVehicle(actorId: string, companyId: string, requestId: string, rawInput: { vehicleId: string; reason: string }) {
  await requireManage(actorId, companyId);
  const input = reassignVehicleSchema.parse(rawInput);
  const buffers = await getCompanyResourceBuffers(companyId);
  return getPrisma().$transaction(async (tx) => {
    const request = await loadRequest(tx, companyId, requestId);
    if (request.status !== 'Confirmed' && request.status !== 'Assigned') {
      throw new RentalLifecycleTransitionError(`The vehicle can only be changed on a Confirmed or Assigned rental (current: "${request.status}").`);
    }
    const current = await activeAssignment(tx, companyId, requestId);
    if (!current) {
      throw new RentalLifecyclePolicyError('RNT_NO_ACTIVE_ASSIGNMENT', 'This rental has no active reservation to reassign.');
    }
    if (current.vehicleId === input.vehicleId) {
      throw new RentalLifecyclePolicyError('RNT_VEHICLE_UNCHANGED', 'The selected vehicle is already assigned to this rental.');
    }
    await assertVehicleUsable(tx, { companyId, vehicleId: input.vehicleId, passengerCount: request.passengerCount });
    const window: RentalConflictWindow = { startAt: current.startsAt, endAt: current.endsAt };
    // Retire before replace (see assignRentalDriver): the still-ACTIVE row
    // would trip the exclusion constraint against its own replacement.
    await tx.rentalAssignment.update({
      where: { id: current.id },
      data: { status: 'REPLACED', releasedAt: new Date(), releaseKind: 'REASSIGNMENT' },
    });
    const replacement = await createAssignment(tx, {
      companyId, requestId, vehicleId: input.vehicleId, driverId: current.driverId,
      window, actorId, buffers, excludeAssignmentId: current.id,
    });
    await writeAuditEvent(tx, auditInput({
      companyId, actorId, entityType: 'RentalRequest', entityId: request.id,
      action: 'RENTAL_REQUEST_VEHICLE_REASSIGNED',
      details: { vehicleId: input.vehicleId, reason: input.reason, assignmentId: replacement.id, replacedAssignmentId: current.id, previousVehicleId: current.vehicleId },
    }));
    return { assignmentId: replacement.id };
  });
}

// ---------------------------------------------------------------- RNT-08

export async function cancelConfirmedRental(actorId: string, companyId: string, requestId: string, rawInput: { reason: string }) {
  await requireManage(actorId, companyId);
  const input = cancelRentalSchema.parse(rawInput);
  const now = new Date();
  return getPrisma().$transaction(async (tx) => {
    const request = await loadRequest(tx, companyId, requestId);
    if (!isAllowedRentalRequestTransition(request.status, 'Cancelled')) {
      throw new RentalLifecycleTransitionError(`Rental request cannot move from "${request.status}" to "Cancelled" through pre-trip cancellation.`);
    }
    const current = await activeAssignment(tx, companyId, requestId);
    if (current && now >= current.startsAt) {
      throw new RentalLifecyclePolicyError('RNT_TRIP_ALREADY_STARTED', 'This trip has started. Cancellation is only available before the trip start; complete the rental instead.');
    }
    await releaseActiveAssignments(tx, companyId, requestId, 'CANCELLATION', now);
    await transitionStatus(tx, {
      request, toStatus: 'Cancelled', actorId, reason: input.reason,
      auditAction: 'RENTAL_REQUEST_CANCELLED',
      auditDetails: { releasedAssignmentId: current?.id ?? null },
    });
    return { cancelled: true };
  });
}

// ---------------------------------------------------------------- RNT-07

export async function submitRentalCompletion(actorId: string, companyId: string, requestId: string, rawInput: z.infer<typeof submitCompletionSchema>) {
  await requireManage(actorId, companyId);
  const input = submitCompletionSchema.parse(rawInput);
  const departure = new Date(input.actualDepartureAt);
  const returned = new Date(input.actualReturnAt);
  const vehicleReturned = new Date(input.vehicleReturnedAt);
  if ([departure, returned, vehicleReturned].some((value) => Number.isNaN(value.getTime()))) {
    throw new RentalLifecyclePolicyError('RNT_COMPLETION_TIMES_INVALID', 'Actual departure, return and vehicle-return times must be valid timestamps.');
  }
  if (returned < departure) {
    throw new RentalLifecyclePolicyError('RNT_COMPLETION_TIMES_ORDER', 'The actual return cannot be before the actual departure.');
  }
  if (input.additionalChargesPesewas > 0 && input.chargesDescription.trim().length < 3) {
    throw new RentalLifecyclePolicyError('RNT_COMPLETION_CHARGES_DESCRIPTION', 'Describe the additional charges so the approver and customer can see what they cover.');
  }
  return getPrisma().$transaction(async (tx) => {
    const request = await loadRequest(tx, companyId, requestId);
    if (request.status !== 'Confirmed' && request.status !== 'Assigned') {
      throw new RentalLifecycleTransitionError(`Only a Confirmed or Assigned rental can be completed (current: "${request.status}").`);
    }
    const pending = await tx.rentalCompletion.findFirst({
      where: { companyId, requestId, status: 'SUBMITTED' },
      select: { id: true },
    });
    if (pending) {
      throw new RentalConflictError('A completion for this rental is already submitted and awaiting decision.');
    }
    const worksheet = request.confirmedWorksheetId
      ? await tx.rentalPricingWorksheet.findFirst({ where: { companyId, requestId, id: request.confirmedWorksheetId } })
      : await tx.rentalPricingWorksheet.findFirst({ where: { companyId, requestId }, orderBy: { version: 'desc' } });
    if (!worksheet) {
      throw new RentalLifecyclePolicyError('RNT_NO_WORKSHEET', 'No pricing worksheet exists for this rental; the quoted amount cannot be established.');
    }
    const completion = await tx.rentalCompletion.create({
      data: {
        companyId, requestId,
        actualDepartureAt: departure, actualReturnAt: returned, vehicleReturnedAt: vehicleReturned,
        actualDistanceMetres: input.actualDistanceMetres ?? null,
        damageNotes: input.damageNotes ?? null,
        customerFeedback: input.customerFeedback ?? null,
        depositReceivedPesewas: input.depositReceivedPesewas,
        additionalChargesPesewas: input.additionalChargesPesewas,
        chargesDescription: input.chargesDescription.trim() || 'No additional charges',
        quotedSubtotalPesewas: worksheet.preTaxSubtotalPesewas,
        submittedById: actorId,
      },
    });
    await writeAuditEvent(tx, auditInput({
      companyId, actorId, entityType: 'RentalRequest', entityId: request.id,
      action: 'RENTAL_REQUEST_COMPLETION_SUBMITTED',
      details: {
        completionId: completion.id, depositReceivedPesewas: input.depositReceivedPesewas,
        additionalChargesPesewas: input.additionalChargesPesewas, worksheetId: worksheet.id,
      },
    }));
    return presentCompletion(completion);
  });
}

export async function decideRentalCompletion(actorId: string, companyId: string, requestId: string, completionId: string, rawInput: z.infer<typeof decideCompletionSchema>) {
  await requireManage(actorId, companyId);
  const input = decideCompletionSchema.parse(rawInput);
  const now = new Date();
  return getPrisma().$transaction(async (tx) => {
    const request = await loadRequest(tx, companyId, requestId);
    const completion = await tx.rentalCompletion.findFirst({ where: { id: completionId, companyId, requestId } });
    if (!completion) throw new RentalLifecycleNotFoundError('The completion record was not found.');
    if (completion.status !== 'SUBMITTED') {
      throw new RentalLifecycleTransitionError('This completion has already been decided.');
    }
    if (completion.submittedById === actorId) {
      throw new RentalLifecyclePolicyError('RNT_COMPLETION_SELF_DECISION', 'The person who submitted this completion cannot decide it. Ask another authorised colleague.');
    }
    if (input.decision === 'RETURN') {
      await tx.rentalCompletion.update({
        where: { id: completion.id },
        data: { status: 'RETURNED', decidedById: actorId, decidedAt: now, decisionReason: input.reason },
      });
      await writeAuditEvent(tx, auditInput({
        companyId, actorId, entityType: 'RentalRequest', entityId: request.id,
        action: 'RENTAL_REQUEST_COMPLETION_RETURNED',
        details: { completionId: completion.id, reason: input.reason },
      }));
      return { decided: 'RETURNED' as const };
    }
    const approvedCharges = input.correctedChargesPesewas ?? completion.additionalChargesPesewas;
    await tx.rentalCompletion.update({
      where: { id: completion.id },
      data: {
        status: 'APPROVED', decidedById: actorId, decidedAt: now,
        decisionReason: input.reason, decisionChargesPesewas: approvedCharges,
      },
    });
    await releaseActiveAssignments(tx, companyId, requestId, 'COMPLETION', now);
    await transitionStatus(tx, {
      request, toStatus: 'Completed', actorId, reason: input.reason,
      auditAction: 'RENTAL_REQUEST_COMPLETION_APPROVED',
      auditDetails: {
        completionId: completion.id, approvedChargesPesewas: approvedCharges,
        depositReceivedPesewas: completion.depositReceivedPesewas,
        quotedSubtotalPesewas: completion.quotedSubtotalPesewas.toString(),
      },
    });
    return { decided: 'APPROVED' as const, outstandingPesewas: outstandingFor({ ...completion, decisionChargesPesewas: approvedCharges, status: 'APPROVED' }) };
  });
}

// ---------------------------------------------------------------- reads

type CompletionRow = {
  id: string; status: string; actualDepartureAt: Date; actualReturnAt: Date; vehicleReturnedAt: Date;
  actualDistanceMetres: number | null; damageNotes: string | null; customerFeedback: string | null;
  depositReceivedPesewas: number; additionalChargesPesewas: number; chargesDescription: string;
  quotedSubtotalPesewas: bigint; submittedById: string; decidedById: string | null;
  decidedAt: Date | null; decisionReason: string | null; decisionChargesPesewas: number | null;
  createdAt: Date;
};

export function outstandingFor(completion: Pick<CompletionRow, 'quotedSubtotalPesewas' | 'additionalChargesPesewas' | 'depositReceivedPesewas' | 'decisionChargesPesewas' | 'status'>): number {
  const charges = completion.status === 'APPROVED' && completion.decisionChargesPesewas !== null
    ? completion.decisionChargesPesewas
    : completion.additionalChargesPesewas;
  return Number(completion.quotedSubtotalPesewas) + charges - completion.depositReceivedPesewas;
}

function presentCompletion(row: CompletionRow) {
  return {
    id: row.id,
    status: row.status,
    actualDepartureAt: row.actualDepartureAt.toISOString(),
    actualReturnAt: row.actualReturnAt.toISOString(),
    vehicleReturnedAt: row.vehicleReturnedAt.toISOString(),
    actualDistanceMetres: row.actualDistanceMetres,
    damageNotes: row.damageNotes,
    customerFeedback: row.customerFeedback,
    depositReceivedPesewas: row.depositReceivedPesewas,
    additionalChargesPesewas: row.additionalChargesPesewas,
    chargesDescription: row.chargesDescription,
    quotedSubtotalPesewas: Number(row.quotedSubtotalPesewas),
    outstandingPesewas: outstandingFor(row),
    submittedById: row.submittedById,
    decidedById: row.decidedById,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionReason: row.decisionReason,
    decisionChargesPesewas: row.decisionChargesPesewas,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getRentalLifecycle(actorId: string, companyId: string, requestId: string) {
  await requireRead(actorId, companyId);
  const prisma = getPrisma();
  const request = await prisma.rentalRequest.findFirst({ where: { id: requestId, companyId } });
  if (!request) throw new RentalLifecycleNotFoundError();
  const [assignments, completions] = await Promise.all([
    prisma.rentalAssignment.findMany({ where: { companyId, requestId }, orderBy: { createdAt: 'desc' } }),
    prisma.rentalCompletion.findMany({ where: { companyId, requestId }, orderBy: { createdAt: 'desc' } }),
  ]);
  const vehicleIds = [...new Set(assignments.map((row) => row.vehicleId).filter((id): id is string => Boolean(id)))];
  const driverIds = [...new Set(assignments.map((row) => row.driverId).filter((id): id is string => Boolean(id)))];
  const [vehicles, drivers] = await Promise.all([
    vehicleIds.length ? prisma.vehicle.findMany({ where: { companyId, id: { in: vehicleIds } }, select: { id: true, registrationNumber: true, make: true, model: true } }) : [],
    driverIds.length ? prisma.driver.findMany({ where: { companyId, id: { in: driverIds } }, select: { id: true, fullName: true } }) : [],
  ]);
  const vehicleById = new Map(vehicles.map((row) => [row.id, row]));
  const driverById = new Map(drivers.map((row) => [row.id, row]));
  return {
    request: {
      id: request.id,
      status: request.status,
      acceptedByName: request.acceptedByName,
      acceptanceAt: request.acceptanceAt?.toISOString().slice(0, 10) ?? null,
      acceptanceReference: request.acceptanceReference,
      confirmedWorksheetId: request.confirmedWorksheetId,
      depositDuePesewas: request.depositDuePesewas,
      depositReceivedPesewas: request.depositReceivedPesewas,
      depositEvidenceReference: request.depositEvidenceReference,
    },
    assignments: assignments.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      vehicleLabel: row.vehicleId ? (() => { const vehicle = vehicleById.get(row.vehicleId); return vehicle ? `${vehicle.registrationNumber} (${vehicle.make} ${vehicle.model})` : row.vehicleId; })() : null,
      driverId: row.driverId,
      driverLabel: row.driverId ? (() => { const driver = driverById.get(row.driverId); return driver ? driver.fullName : row.driverId; })() : null,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: row.status,
      releaseKind: row.releaseKind,
      releasedAt: row.releasedAt?.toISOString() ?? null,
    })),
    completions: completions.map(presentCompletion),
  };
}
