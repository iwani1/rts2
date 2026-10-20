import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignRole } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { createRentalRequest, submitRentalRequest, transitionRentalRequest } from './rental-requests';
import { createRentalPricingWorksheet } from './pricing-worksheets';

const prisma = getPrisma();
let companyId = '';
let managerId = '';
let requestId = '';

async function makeUser(name: string) {
  return prisma.user.create({ data: { name, email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } });
}

const requestDraft = (customerId: string) => ({
  customerId, serviceDate: '2026-10-20', departureTime: '08:00', returnTime: null, returnDate: null,
  durationMinutes: 90, pickupLocation: 'Test pickup', destination: 'Test destination', intermediateStops: null,
  passengerCount: 1, luggageSpecialNeeds: null, purpose: null, requestedVehicleType: null,
  driverRequirement: null, tripContactName: null, tripContactTelephone: null, tripContactEmail: null,
  notes: null, requestSource: 'PHONE', reason: 'Create request for worksheet integration',
});

describe('immutable rental pricing worksheets with PostgreSQL', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, admin, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Pricing worksheet ${randomUUID()}` } }),
      makeUser('Pricing worksheet admin'), makeUser('Pricing worksheet manager'),
    ]);
    companyId = company.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: admin.id, roleCode: 'SUPER_ADMIN', assignedById: admin.id, reason: 'Pricing worksheet integration administrator' },
    });
    await assignRole({ actorId: admin.id, targetUserId: manager.id, companyId, roleCode: 'OPS_MANAGER', reason: 'Pricing worksheet integration manager' });
    const customer = await prisma.customer.create({ data: { companyId, displayName: 'Worksheet test customer' } });
    const request = await createRentalRequest(requestDraft(customer.id), managerId, companyId);
    requestId = request.id;
    await submitRentalRequest({ reason: 'Submit request for worksheet integration' }, managerId, companyId, requestId);
    await transitionRentalRequest({ toStatus: 'Under Review', reason: 'Begin controlled worksheet review' }, managerId, companyId, requestId);
    await prisma.setting.create({
      data: { companyId, key: 'rental.pricing_models', configured: true, value: [{ code: 'HOUR', label: 'Hourly test rate', unit: 'PER_HOUR', ratePesewas: 6000 }] },
    });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('creates transactionally audited sequential versions and preserves immutable snapshots', async () => {
    const first = await createRentalPricingWorksheet({
      actorId: managerId, companyId, requestId, modelCodes: ['HOUR'], reason: 'Prepare first internal estimate',
    });
    const second = await createRentalPricingWorksheet({
      actorId: managerId, companyId, requestId, modelCodes: ['HOUR'], reason: 'Refresh internal estimate for review',
    });
    expect(first).toMatchObject({ version: 1, preTaxSubtotalPesewas: 9000 });
    expect(second).toMatchObject({ version: 2, preTaxSubtotalPesewas: 9000 });
    expect(second.lines[0]).toMatchObject({ modelCode: 'HOUR', ratePesewas: 6000, quantity: { durationMinutes: 90 } });
    const audit = await prisma.auditEvent.findMany({ where: { entityType: 'RENTAL_PRICING_WORKSHEET', entityId: second.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.summary).toMatchObject({ requestId, version: 2, lineCount: 1 });
    await expect(prisma.rentalPricingWorksheet.update({ where: { id: first.id }, data: { reason: 'Tamper with worksheet' } })).rejects.toBeDefined();
    await expect(prisma.rentalPricingWorksheet.delete({ where: { id: first.id } })).rejects.toBeDefined();
  });

  it('does not create worksheets when the rental request is no longer Under Review', async () => {
    await transitionRentalRequest({ toStatus: 'Declined', reason: 'End worksheet eligibility test' }, managerId, companyId, requestId);
    await expect(createRentalPricingWorksheet({
      actorId: managerId, companyId, requestId, modelCodes: ['HOUR'], reason: 'Attempt worksheet after decline',
    })).rejects.toThrow('not available for this request');
  });
});
