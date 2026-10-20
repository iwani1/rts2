import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignRole } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { createWorkOrder, listWorkOrders, transitionWorkOrder } from './work-orders';

const prisma = getPrisma();
let companyId = '';
let managerId = '';
let approverId = '';
let vehicleId = '';

describe('non-safety maintenance work orders with PostgreSQL', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, admin, manager, approver] = await Promise.all([
      prisma.company.create({ data: { name: `Work orders ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Work order test admin', email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Work order test manager', email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Work order test approver', email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    managerId = manager.id;
    approverId = approver.id;
    await prisma.userRoleAssignment.create({ data: {
      userId: admin.id, roleCode: 'SUPER_ADMIN', assignedById: admin.id, reason: 'Work-order integration administrator',
    } });
    await Promise.all([manager, approver].map((user) => assignRole({
      actorId: admin.id, targetUserId: user.id, companyId, roleCode: 'FLEET_MANAGER', reason: 'Work-order integration manager',
    })));
    const vehicle = await prisma.vehicle.create({ data: {
      companyId, registrationNumber: `WO-${randomUUID().slice(0, 8)}`, make: 'Test', model: 'Van', category: 'Integration fixture',
    } });
    vehicleId = vehicle.id;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('persists and lists an explicit non-safety report without assuming unit, priority or work type', async () => {
    const created = await createWorkOrder({
      actorId: managerId, companyId, vehicleId, reportedFault: 'Door latch sticks during opening',
      dateReported: '2026-10-20', safetyRelated: false, reason: 'Log a non-safety door inspection',
    });
    expect(created).toMatchObject({ status: 'Reported', safetyRelated: false, workType: null, priority: null, odometerValue: null, odometerUnit: null });
    const rows = await listWorkOrders(managerId, companyId);
    expect(rows.some((row) => row.id === created.id && row.dateReported === '2026-10-20')).toBe(true);

    const sequence = [
      ['Awaiting Inspection', 'Send for inspection before authorizing work'],
      ['Approved', 'Authorize the inspection findings and planned repair'],
      ['In Progress', 'Begin the approved non-safety repair'],
      ['Awaiting Review', 'Repair work is ready for inspection review'],
      ['Completed', 'Inspection passed and repair evidence recorded'],
    ] as const;
    for (const [toStatus, reason] of sequence) {
      await transitionWorkOrder({
        actorId: approverId, companyId, workOrderId: created.id, toStatus, reason,
        ...(toStatus === 'Approved' ? { requiredWork: 'Adjust the latch and verify operation', parts: 'None specified' } : {}),
        ...(toStatus === 'Completed' ? {
          completionDate: new Date(Date.now() - 60_000).toISOString(), inspectionResults: 'Latch operation inspected and passed',
          labourCostPesewas: 12500,
        } : {}),
      });
    }
    const history = await prisma.$queryRaw<Array<{ sequence: number; fromStatus: string | null; toStatus: string }>>`
      SELECT "sequence", "fromStatus", "toStatus" FROM "MaintenanceWorkOrderStatusHistory"
      WHERE "companyId" = ${companyId} AND "workOrderId" = ${created.id} ORDER BY "sequence"
    `;
    expect(history.map((event) => event.toStatus)).toEqual(['Reported', ...sequence.map(([status]) => status)]);
    const [persisted] = await prisma.$queryRaw<Array<{ status: string; labourCostPesewas: bigint | null }>>`
      SELECT "status", "labourCostPesewas" FROM "MaintenanceWorkOrder"
      WHERE "companyId" = ${companyId} AND "id" = ${created.id}
    `;
    expect(persisted).toEqual({ status: 'Completed', labourCostPesewas: BigInt(12500) });
  });
});
