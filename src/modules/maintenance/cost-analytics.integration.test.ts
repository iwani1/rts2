import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignRole } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { createWorkOrder, transitionWorkOrder } from './work-orders';
import { getMaintenanceCostAnalytics } from './cost-analytics';

const prisma = getPrisma();
let companyId = '';
let managerId = '';
let vehicleId = '';

async function completeWorkOrder(input: {
  reportedFault: string; workType: string; labour: number; parts: number; completionDate: string;
}) {
  const created = await createWorkOrder({
    actorId: managerId, companyId, vehicleId,
    reportedFault: input.reportedFault, workType: input.workType,
    dateReported: '2026-10-01', safetyRelated: false, reason: 'Analytics fixture report',
  });
  const sequence = [
    ['Awaiting Inspection', 'Send for inspection before authorizing work'],
    ['Approved', 'Authorize the inspection findings and planned repair'],
    ['In Progress', 'Begin the approved repair'],
    ['Awaiting Review', 'Repair work is ready for inspection review'],
    ['Completed', 'Inspection passed and repair evidence recorded'],
  ] as const;
  for (const [toStatus, reason] of sequence) {
    await transitionWorkOrder({
      actorId: managerId, companyId, workOrderId: created.id, toStatus, reason,
      ...(toStatus === 'Approved' ? { requiredWork: 'Complete the repair', parts: 'As listed' } : {}),
      ...(toStatus === 'Completed' ? {
        completionDate: `${input.completionDate}T12:00:00.000Z`, inspectionResults: 'Work inspected and passed',
        labourCostPesewas: input.labour, partsCostPesewas: input.parts,
      } : {}),
    });
  }
  return created;
}

describe('MNT-04 maintenance cost analytics with PostgreSQL (D-083)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, admin, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Maintenance analytics ${randomUUID()}` } }),
      prisma.user.create({ data: { name: 'Analytics admin', email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
      prisma.user.create({ data: { name: 'Analytics manager', email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } }),
    ]);
    companyId = company.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: admin.id, roleCode: 'SUPER_ADMIN', assignedById: admin.id, reason: 'Analytics integration administrator' },
    });
    await assignRole({
      actorId: admin.id, targetUserId: manager.id, companyId, roleCode: 'FLEET_MANAGER', reason: 'Analytics integration manager',
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId, registrationNumber: `MNT-${randomUUID().slice(0, 8).toUpperCase()}`,
        make: 'Test', model: 'Coach', category: 'Integration fixture',
      },
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('aggregates recorded spend, turnaround and recurring faults from governed work orders', async () => {
    await completeWorkOrder({
      reportedFault: 'Brake pedal soft', workType: 'Brakes', labour: 10000, parts: 30000, completionDate: '2026-10-05',
    });
    await completeWorkOrder({
      reportedFault: 'Brake pedal soft', workType: 'Brakes', labour: 8000, parts: 12000, completionDate: '2026-10-11',
    });
    await createWorkOrder({
      actorId: managerId, companyId, vehicleId, reportedFault: 'Mirror cracked',
      dateReported: '2026-10-12', safetyRelated: false, reason: 'Analytics fixture open order',
    });

    const analytics = await getMaintenanceCostAnalytics({ actorId: managerId, companyId });
    expect(analytics.finishedWorkOrders).toBe(2);
    expect(analytics.finishedWithAnyCost).toBe(2);
    expect(analytics.partsVsLabour).toEqual({
      labourPesewas: 18000, partsPesewas: 42000, otherPesewas: 0, totalPesewas: 60000,
    });
    const vehicle = analytics.spendByVehicle.find((row) => row.vehicleId === vehicleId);
    expect(vehicle).toMatchObject({ workOrderCount: 2, withCostCount: 2, totalPesewas: 60000 });
    expect(analytics.repairsByType.find((row) => row.workType === 'Brakes')?.workOrderCount).toBe(2);
    expect(analytics.recurringFaults).toContainEqual(
      expect.objectContaining({ reportedFault: 'Brake pedal soft', occurrences: 2 }),
    );
    expect(analytics.openBacklog.count).toBe(1);

    const windowed = await getMaintenanceCostAnalytics({
      actorId: managerId, companyId, fromDate: '2026-10-06', toDate: '2026-10-31',
    });
    expect(windowed.finishedWorkOrders).toBe(1);
    expect(windowed.partsVsLabour.totalPesewas).toBe(20000);
  });
});
