import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignRole } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { createRentalRequest, submitRentalRequest, transitionRentalRequest } from './rental-requests';
import { createRentalPricingWorksheet } from './pricing-worksheets';
import {
  RentalConflictError,
  RentalLifecyclePolicyError,
  assignRentalDriver,
  cancelConfirmedRental,
  confirmRentalRequest,
  decideRentalCompletion,
  getRentalLifecycle,
  submitRentalCompletion,
} from './rental-lifecycle';

const prisma = getPrisma();
let companyId = '';
let managerId = '';
let approverId = '';
let vehicleId = '';
let driverId = '';
let driver2Id = '';

async function makeUser(name: string) {
  return prisma.user.create({ data: { name, email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } });
}

const draftFor = (customerId: string, serviceDate = '2027-01-15') => ({
  customerId, serviceDate, departureTime: '08:00', returnTime: null, returnDate: null,
  durationMinutes: 90, pickupLocation: 'Accra Mall', destination: 'Kotoka Airport', intermediateStops: null,
  passengerCount: 2, luggageSpecialNeeds: null, purpose: null, requestedVehicleType: null,
  driverRequirement: null, tripContactName: null, tripContactTelephone: null, tripContactEmail: null,
  notes: null, requestSource: 'PHONE', reason: 'Create request for lifecycle integration',
});

async function reviewedRequest(serviceDate?: string) {
  const customer = await prisma.customer.create({ data: { companyId, displayName: `Lifecycle customer ${randomUUID().slice(0, 6)}` } });
  const request = await createRentalRequest(draftFor(customer.id, serviceDate), managerId, companyId);
  await submitRentalRequest({ reason: 'Submit for lifecycle integration' }, managerId, companyId, request.id);
  await transitionRentalRequest({ toStatus: 'Under Review', reason: 'Begin lifecycle review' }, managerId, companyId, request.id);
  await createRentalPricingWorksheet({ actorId: managerId, companyId, requestId: request.id, modelCodes: ['HOUR'], reason: 'First internal estimate' });
  await createRentalPricingWorksheet({ actorId: managerId, companyId, requestId: request.id, modelCodes: ['HOUR'], reason: 'Refreshed internal estimate' });
  return request.id;
}

function setSetting(key: string, value: unknown) {
  return prisma.setting.upsert({
    where: { companyId_key: { companyId, key } },
    create: { companyId, key, configured: true, value: value as never },
    update: { configured: true, value: value as never },
  });
}

const confirmArgs = (vehId: string, extra: Record<string, unknown> = {}) => ({
  vehicleId: vehId,
  acceptedByName: 'Ama Serwaa',
  acceptanceAt: '2027-01-10',
  acceptanceReference: 'Email acceptance 10 Jan',
  reason: 'Customer accepted the quotation and vehicle reserved',
  ...extra,
});

describe('Phase 4 rental lifecycle with PostgreSQL (D-089)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, admin, manager, approver] = await Promise.all([
      prisma.company.create({ data: { name: `Rental lifecycle ${randomUUID()}` } }),
      makeUser('Lifecycle admin'), makeUser('Lifecycle manager'), makeUser('Lifecycle approver'),
    ]);
    companyId = company.id;
    managerId = manager.id;
    approverId = approver.id;
    await prisma.userRoleAssignment.create({
      data: { userId: admin.id, roleCode: 'SUPER_ADMIN', assignedById: admin.id, reason: 'Lifecycle integration administrator' },
    });
    for (const user of [manager, approver]) {
      await assignRole({ actorId: admin.id, targetUserId: user.id, companyId, roleCode: 'OPS_MANAGER', reason: 'Lifecycle integration role' });
    }
    await setSetting('rental.pricing_models', [{ code: 'HOUR', label: 'Hourly test rate', unit: 'PER_HOUR', ratePesewas: 6000 }]);
    const vehicle = await prisma.vehicle.create({
      data: { companyId, registrationNumber: `LFC-${randomUUID().slice(0, 6).toUpperCase()}`, make: 'Test', model: 'Coaster', category: 'Integration fixture', seatCount: 12 },
    });
    vehicleId = vehicle.id;
    const driver = await prisma.driver.create({ data: { companyId, fullName: 'Kwame Mensah', status: 'ACTIVE' } });
    const driver2 = await prisma.driver.create({ data: { companyId, fullName: 'Efua Owusu', status: 'ACTIVE' } });
    driverId = driver.id;
    driver2Id = driver2.id;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('fails closed when the deposit policy is not configured', async () => {
    const requestId = await reviewedRequest();
    await expect(confirmRentalRequest(managerId, companyId, requestId, confirmArgs(vehicleId)))
      .rejects.toMatchObject({ code: 'RNT_DEPOSIT_POLICY_NOT_CONFIGURED' });
  });

  it('fails closed when resource buffers are not configured', async () => {
    await setSetting('rental.deposit_policy', { kind: 'NOT_REQUIRED' });
    const requestId = await reviewedRequest();
    await expect(confirmRentalRequest(managerId, companyId, requestId, confirmArgs(vehicleId)))
      .rejects.toMatchObject({ code: 'RNT_BUFFER_NOT_CONFIGURED' });
  });

  it('confirms with acceptance facts and an ACTIVE vehicle reservation from the latest worksheet', async () => {
    await setSetting('fleet.vehicle_between_job_buffer_minutes', 30);
    await setSetting('fleet.driver_between_job_buffer_minutes', 15);
    await setSetting('rental.deposit_policy', { kind: 'FIXED_AMOUNT', amountPesewas: 5000, collectionStage: 'BEFORE_CONFIRMATION' });
    const requestId = await reviewedRequest();
    await expect(confirmRentalRequest(managerId, companyId, requestId, confirmArgs(vehicleId)))
      .rejects.toMatchObject({ code: 'RNT_DEPOSIT_NOT_RECEIVED' });
    const result = await confirmRentalRequest(managerId, companyId, requestId, confirmArgs(vehicleId, {
      depositReceivedPesewas: 5000, depositEvidenceReference: 'MoMo ref 123456',
    }));
    expect(result.depositDuePesewas).toBe(5000);
    const lifecycle = await getRentalLifecycle(managerId, companyId, requestId);
    expect(lifecycle.request.status).toBe('Confirmed');
    expect(lifecycle.request.acceptedByName).toBe('Ama Serwaa');
    expect(lifecycle.request.depositReceivedPesewas).toBe(5000);
    expect(lifecycle.assignments).toHaveLength(1);
    expect(lifecycle.assignments[0]).toMatchObject({ status: 'ACTIVE', vehicleId });
    const requestRow = await prisma.rentalRequest.findUniqueOrThrow({ where: { id: requestId } });
    const worksheets = await prisma.rentalPricingWorksheet.findMany({ where: { requestId }, orderBy: { version: 'desc' } });
    expect(requestRow.confirmedWorksheetId).toBe(worksheets[0]?.id);
    (globalThis as Record<string, unknown>).__confirmedRequestId = requestId;
  });

  it('rejects a double-booking for the same vehicle in the same or buffered window', async () => {
    const clashId = await reviewedRequest();
    await expect(confirmRentalRequest(managerId, companyId, clashId, confirmArgs(vehicleId, {
      depositReceivedPesewas: 5000, depositEvidenceReference: 'MoMo ref 123456',
    }))).rejects.toBeInstanceOf(RentalConflictError);
    // A different day confirms cleanly.
    const okId = await reviewedRequest('2027-01-20');
    await confirmRentalRequest(managerId, companyId, okId, confirmArgs(vehicleId, {
      depositReceivedPesewas: 5000, depositEvidenceReference: 'MoMo ref 123456',
    }));
    (globalThis as Record<string, unknown>).__futureRequestId = okId;
  });

  it('assigns and reassigns the driver, replacing the ACTIVE ledger row', async () => {
    const requestId = (globalThis as Record<string, unknown>).__confirmedRequestId as string;
    await assignRentalDriver(managerId, companyId, requestId, { driverId });
    let lifecycle = await getRentalLifecycle(managerId, companyId, requestId);
    expect(lifecycle.request.status).toBe('Assigned');
    expect(lifecycle.assignments[0]).toMatchObject({ status: 'ACTIVE', driverId });
    await assignRentalDriver(managerId, companyId, requestId, { driverId: driver2Id });
    lifecycle = await getRentalLifecycle(managerId, companyId, requestId);
    expect(lifecycle.request.status).toBe('Assigned');
    expect(lifecycle.assignments.filter((row) => row.status === 'ACTIVE')).toHaveLength(1);
    expect(lifecycle.assignments.find((row) => row.status === 'ACTIVE')?.driverId).toBe(driver2Id);
    expect(lifecycle.assignments.some((row) => row.status === 'REPLACED')).toBe(true);
  });

  it('cancels a future confirmed booking and releases the reservation', async () => {
    const requestId = (globalThis as Record<string, unknown>).__futureRequestId as string;
    await cancelConfirmedRental(managerId, companyId, requestId, { reason: 'Customer postponed the trip' });
    const lifecycle = await getRentalLifecycle(managerId, companyId, requestId);
    expect(lifecycle.request.status).toBe('Cancelled');
    expect(lifecycle.assignments[0]).toMatchObject({ status: 'RELEASED', releaseKind: 'CANCELLATION' });
  });

  it('refuses cancellation once the trip has started', async () => {
    const pastId = await reviewedRequest('2026-01-10');
    await confirmRentalRequest(managerId, companyId, pastId, confirmArgs(vehicleId, {
      depositReceivedPesewas: 5000, depositEvidenceReference: 'MoMo ref 123456',
    }));
    await expect(cancelConfirmedRental(managerId, companyId, pastId, { reason: 'Too late to cancel' }))
      .rejects.toMatchObject({ code: 'RNT_TRIP_ALREADY_STARTED' });
  });

  it('completes through the two-step approval with separation of duties', async () => {
    const requestId = (globalThis as Record<string, unknown>).__confirmedRequestId as string;
    const completion = await submitRentalCompletion(managerId, companyId, requestId, {
      actualDepartureAt: '2027-01-15T08:05:00.000Z',
      actualReturnAt: '2027-01-15T09:40:00.000Z',
      vehicleReturnedAt: '2027-01-15T09:45:00.000Z',
      actualDistanceMetres: 32000,
      damageNotes: null,
      customerFeedback: 'Great service',
      depositReceivedPesewas: 5000,
      additionalChargesPesewas: 1500,
      chargesDescription: 'Extra waiting time',
    });
    // Subtotal 90 min * 6000/hr = 9000; proposed outstanding 9000 + 1500 - 5000.
    expect(completion).toMatchObject({ status: 'SUBMITTED', quotedSubtotalPesewas: 9000, outstandingPesewas: 5500 });
    await expect(decideRentalCompletion(managerId, companyId, requestId, completion.id, {
      decision: 'APPROVE', reason: 'Trying to decide own submission',
    })).rejects.toBeInstanceOf(RentalLifecyclePolicyError);
    const decision = await decideRentalCompletion(approverId, companyId, requestId, completion.id, {
      decision: 'APPROVE', reason: 'Verified against the trip report', correctedChargesPesewas: 1000,
    });
    expect(decision).toMatchObject({ decided: 'APPROVED', outstandingPesewas: 5000 });
    const lifecycle = await getRentalLifecycle(managerId, companyId, requestId);
    expect(lifecycle.request.status).toBe('Completed');
    expect(lifecycle.assignments.find((row) => row.status === 'ACTIVE')).toBeUndefined();
    expect(lifecycle.assignments[0]).toMatchObject({ status: 'RELEASED', releaseKind: 'COMPLETION' });
    const history = await prisma.rentalRequestStatusHistory.findMany({
      where: { companyId, requestId }, orderBy: { createdAt: 'asc' },
    });
    expect(history.map((row) => row.toStatus)).toEqual(['Draft', 'Submitted', 'Under Review', 'Confirmed', 'Assigned', 'Completed']);
  });
});
