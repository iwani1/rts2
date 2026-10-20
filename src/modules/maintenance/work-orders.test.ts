import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn(), resolvePermission: vi.fn() }));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));
vi.mock('@/modules/auth/permissions', () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error { constructor() { super('Access denied'); } },
  resolvePermission: mocks.resolvePermission,
}));

import { createWorkOrder, listWorkOrders, transitionWorkOrder } from './work-orders';

const input = {
  actorId: 'manager-1', companyId: 'company-1', vehicleId: 'vehicle-1', reportedFault: 'Front left door latch sticks when opened',
  workType: 'Inspection', priority: 'Routine', dateReported: '2026-10-20', odometerValue: 34567.5, odometerUnit: 'KM',
  safetyRelated: false, reason: 'Record a routine non-safety door inspection',
};

function createFixture({ allowed = true, scopes = ['COMPANY'], vehicleFound = true } = {}) {
  const workOrder = {
    id: 'wo-1', reference: 'WO-AABBCCDDEEFF0011', status: 'Reported', safetyRelated: false,
    vehicle: { registrationNumber: 'GT-1234-25', make: 'Test', model: 'Van' },
  };
  const tx = {
    company: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    vehicle: { findFirst: vi.fn().mockResolvedValue(vehicleFound ? { id: 'vehicle-1', odometerUnit: 'KM' } : null) },
    maintenanceWorkOrder: { create: vi.fn().mockResolvedValue(workOrder) },
    maintenanceWorkOrderStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  mocks.getPrisma.mockReturnValue({ $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) });
  mocks.resolvePermission.mockResolvedValue({ allowed, scopes });
  return { tx, workOrder };
}

function transitionFixture({ status = 'Reported', createdById = 'reporter-1', sequence = 1 } = {}) {
  const tx = {
    company: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'wo-1', status, createdById, reference: 'WO-AABBCCDDEEFF0011' }]),
    maintenanceWorkOrder: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    maintenanceWorkOrderStatusHistory: {
      findFirst: vi.fn().mockResolvedValue({ sequence }), create: vi.fn().mockResolvedValue({}),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const transaction = vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  mocks.getPrisma.mockReturnValue({ $transaction: transaction });
  mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['COMPANY'] });
  return { tx, transaction };
}

const transitionInput = { actorId: 'manager-1', companyId: 'company-1', workOrderId: 'wo-1', toStatus: 'Awaiting Inspection', reason: 'Schedule a non-safety maintenance inspection' };

describe('maintenance work-order intake', () => {
  beforeEach(() => vi.resetAllMocks());

  it('records an explicitly non-safety report, initializes Reported, and audits in the same transaction', async () => {
    const { tx, workOrder } = createFixture();
    await expect(createWorkOrder(input)).resolves.toEqual(workOrder);
    expect(tx.maintenanceWorkOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reference: expect.stringMatching(/^WO-[A-F0-9]{16}$/), status: 'Reported', safetyRelated: false,
        odometerValue: 34567.5, odometerUnit: 'KM',
      }),
    }));
    expect(tx.maintenanceWorkOrderStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sequence: 1, fromStatus: null, toStatus: 'Reported', actorId: input.actorId }),
    }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'MAINTENANCE_WORK_ORDER_REPORTED', entityType: 'MAINTENANCE_WORK_ORDER' }),
    }));
  });

  it('allows the Fleet Manager maintenance approval/release scope for intake', async () => {
    const { tx } = createFixture({ scopes: ['APPROVE_RELEASE'] });
    await expect(createWorkOrder(input)).resolves.toBeDefined();
    expect(tx.maintenanceWorkOrder.create).toHaveBeenCalledOnce();
  });

  it('denies limited technician and driver scopes from manager intake', async () => {
    const { tx } = createFixture({ scopes: ['WORK_ORDER_UPDATE_NO_RELEASE'] });
    await expect(createWorkOrder(input)).rejects.toThrow('Access denied');
    expect(tx.maintenanceWorkOrder.create).not.toHaveBeenCalled();
  });

  it('refuses safety-related reports because no safety-block workflow is active', async () => {
    createFixture();
    await expect(createWorkOrder({ ...input, safetyRelated: true })).rejects.toThrow('Safety-related work orders cannot be entered');
  });

  it('requires an explicit matching odometer unit and rejects a unit without a reading', async () => {
    createFixture();
    await expect(createWorkOrder({ ...input, odometerUnit: undefined })).rejects.toThrow('odometer unit');
    await expect(createWorkOrder({ ...input, odometerValue: null, odometerUnit: 'KM' })).rejects.toThrow('odometer unit');
  });

  it('fails closed for a missing or archived company vehicle', async () => {
    const { tx } = createFixture({ vehicleFound: false });
    await expect(createWorkOrder(input)).rejects.toThrow('not available');
    expect(tx.maintenanceWorkOrder.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('returns a no-store-ready, tenant-scoped list with stable date-only values', async () => {
    mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['COMPANY'] });
    const row = {
      id: 'wo-1', reference: 'WO-AABBCCDDEEFF0011', vehicleId: 'vehicle-1', reportedFault: 'Door latch sticks',
      workType: null, priority: null, dateReported: new Date('2026-10-20T00:00:00.000Z'), status: 'Reported',
      vehicle: { registrationNumber: 'GT-1234-25', make: 'Test', model: 'Van' },
      statusHistory: [{ sequence: 2, fromStatus: 'Reported', toStatus: 'Awaiting Inspection', reason: 'Send for inspection before approval', createdAt: new Date('2026-10-21T10:00:00.000Z'), actor: { name: 'Manager' } }],
    };
    const findMany = vi.fn().mockResolvedValue([row]);
    mocks.getPrisma.mockReturnValue({ company: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) }, maintenanceWorkOrder: { findMany } });
    await expect(listWorkOrders('manager-1', 'company-1')).resolves.toEqual([{
      ...row, dateReported: '2026-10-20', statusHistory: [{ sequence: 2, fromStatus: 'Reported', toStatus: 'Awaiting Inspection',
        reason: 'Send for inspection before approval', createdAt: '2026-10-21T10:00:00.000Z', actorName: 'Manager' }],
    }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: 'company-1' }, take: 100,
      select: expect.objectContaining({ statusHistory: expect.objectContaining({ take: 50, orderBy: { sequence: 'desc' } }) }),
    }));
    await expect(listWorkOrders('manager-1', 'company-1', 'Reported')).resolves.toHaveLength(1);
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { companyId: 'company-1', status: 'Reported' } }));
    await expect(listWorkOrders('manager-1', 'company-1', 'Fictitious')).rejects.toThrow();
  });

  it('advances only valid statuses and records sequenced status history plus audit atomically', async () => {
    const { tx } = transitionFixture({ status: 'Reported', sequence: 1 });
    await expect(transitionWorkOrder(transitionInput)).resolves.toMatchObject({
      id: 'wo-1', reference: 'WO-AABBCCDDEEFF0011', fromStatus: 'Reported', status: 'Awaiting Inspection',
    });
    expect(tx.maintenanceWorkOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wo-1', companyId: 'company-1', status: 'Reported' }, data: { status: 'Awaiting Inspection' },
    }));
    expect(tx.maintenanceWorkOrderStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sequence: 2, fromStatus: 'Reported', toStatus: 'Awaiting Inspection', reason: transitionInput.reason }),
    }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'MAINTENANCE_WORK_ORDER_STATUS_CHANGED' }),
    }));
  });

  it('requires a different manager to approve and rejects an invalid status jump', async () => {
    const { tx } = transitionFixture({ status: 'Awaiting Inspection', createdById: 'manager-1' });
    await expect(transitionWorkOrder({ ...transitionInput, toStatus: 'Approved' })).rejects.toThrow('different authorized manager');
    expect(tx.maintenanceWorkOrder.updateMany).not.toHaveBeenCalled();
    await expect(transitionWorkOrder({ ...transitionInput, toStatus: 'Completed', completionDate: new Date().toISOString(), inspectionResults: 'Passed inspection result' })).rejects.toThrow('not allowed');
  });

  it('requires completion and inspection records and stores only explicitly supplied costs', async () => {
    transitionFixture({ status: 'Awaiting Review', createdById: 'reporter-2' });
    await expect(transitionWorkOrder({ ...transitionInput, toStatus: 'Completed' })).rejects.toThrow('Completion requires a date and inspection results');
    const { tx } = transitionFixture({ status: 'Awaiting Review', createdById: 'reporter-2' });
    const completionDate = new Date(Date.now() - 60_000).toISOString();
    await expect(transitionWorkOrder({
      ...transitionInput, toStatus: 'Completed', completionDate,
      inspectionResults: 'Inspection passed after routine work', labourCostPesewas: 9000,
    })).resolves.toMatchObject({ status: 'Completed' });
    expect(tx.maintenanceWorkOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'Completed', completionDate: new Date(completionDate), labourCostPesewas: BigInt(9000) }),
    }));
    expect(tx.maintenanceWorkOrder.updateMany.mock.calls[0]?.[0]).not.toHaveProperty('data.partsCostPesewas');
  });
});
