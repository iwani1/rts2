import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignRole } from '@/modules/auth/permissions';
import { getPrisma } from '@/server/prisma';
import { createRentalRequest, submitRentalRequest, transitionRentalRequest } from './rental-requests';
import { createRentalPricingWorksheet } from './pricing-worksheets';
import { confirmRentalRequest } from './rental-lifecycle';
import { getRentalPortalHome } from '@/modules/rental-portal/portal';
import { decideOwnRentalQuotation, issueRentalQuotation } from './rental-quotations';

const prisma = getPrisma();
let companyId = '';
let opsId = '';
let customerUserId = '';
let strangerUserId = '';
let requestId = '';

async function makeUser(name: string) {
  return prisma.user.create({ data: { name, email: `${randomUUID()}@example.invalid`, status: 'ACTIVE' } });
}

function setSetting(key: string, value: unknown) {
  return prisma.setting.upsert({
    where: { companyId_key: { companyId, key } },
    create: { companyId, key, configured: true, value: value as never },
    update: { configured: true, value: value as never },
  });
}

describe('Phase 5B rental quotations with PostgreSQL (D-090)', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, admin, ops, customerUser, stranger] = await Promise.all([
      prisma.company.create({ data: { name: `Rental quotations ${randomUUID()}` } }),
      makeUser('Quotation admin'), makeUser('Quotation ops'), makeUser('Quotation customer'), makeUser('Quotation stranger'),
    ]);
    companyId = company.id;
    opsId = ops.id;
    customerUserId = customerUser.id;
    strangerUserId = stranger.id;
    await prisma.userRoleAssignment.create({
      data: { userId: admin.id, roleCode: 'SUPER_ADMIN', assignedById: admin.id, reason: 'Quotation integration administrator' },
    });
    await assignRole({ actorId: admin.id, targetUserId: ops.id, companyId, roleCode: 'OPS_MANAGER', reason: 'Quotation integration role' });
    await setSetting('rental.pricing_models', [{ code: 'HOUR', label: 'Hourly rate', unit: 'PER_HOUR', ratePesewas: 6000 }]);
    await setSetting('finance.tax_lines', [{ code: 'VAT', label: 'VAT', rateBasisPoints: 1000 }]);
    const customer = await prisma.customer.create({
      data: { companyId, displayName: 'Quotation test customer', userId: customerUser.id },
    });
    const request = await createRentalRequest({
      customerId: customer.id, serviceDate: '2027-03-12', departureTime: '08:00', returnTime: null, returnDate: null,
      durationMinutes: 90, pickupLocation: 'Accra Mall', destination: 'Achimota', intermediateStops: null,
      passengerCount: 2, luggageSpecialNeeds: null, purpose: null, requestedVehicleType: null,
      driverRequirement: null, tripContactName: null, tripContactTelephone: null, tripContactEmail: null,
      notes: null, requestSource: 'APP', reason: 'Create request for quotation integration',
    }, opsId, companyId);
    requestId = request.id;
    await submitRentalRequest({ reason: 'Submit for quotation integration' }, opsId, companyId, requestId);
    await transitionRentalRequest({ toStatus: 'Under Review', reason: 'Begin quotation review' }, opsId, companyId, requestId);
    await createRentalPricingWorksheet({ actorId: opsId, companyId, requestId, modelCodes: ['HOUR'], reason: 'Internal estimate' });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('fails closed when quotation validity is not configured', async () => {
    await expect(issueRentalQuotation(opsId, companyId, requestId))
      .rejects.toMatchObject({ code: 'QTN_VALIDITY_NOT_CONFIGURED' });
  });

  it('issues a snapshot quotation the linked customer can accept in the portal', async () => {
    await setSetting('rental.quote_validity', 7);
    const issued = await issueRentalQuotation(opsId, companyId, requestId);
    // 9000 pre-tax + 10% VAT = 9900.
    expect(issued).toMatchObject({ status: 'ISSUED', subtotalPesewas: 9000, taxPesewas: 900, totalPesewas: 9900, worksheetVersion: 1 });
    expect(issued.reference).toMatch(/^QUO-[0-9A-F]{16}$/);
    const home = await getRentalPortalHome({ actorId: customerUserId, companyId });
    expect(home.quotations.state).toBe('LIST');
    if (home.quotations.state === 'LIST') {
      expect(home.quotations.items[0]).toMatchObject({ id: issued.id, displayStatus: 'ISSUED', totalPesewas: 9900 });
    }
    await expect(decideOwnRentalQuotation(strangerUserId, companyId, issued.id, {
      decision: 'ACCEPTED', reason: 'Not my quotation to accept',
    })).rejects.toMatchObject({ code: 'RENTAL_QUOTATION_NOT_FOUND' });
    const decided = await decideOwnRentalQuotation(customerUserId, companyId, issued.id, {
      decision: 'ACCEPTED', reason: 'Happy with the price, please proceed',
    });
    expect(decided.status).toBe('ACCEPTED');
    await expect(decideOwnRentalQuotation(customerUserId, companyId, issued.id, {
      decision: 'DECLINED', reason: 'Trying to change my mind',
    })).rejects.toMatchObject({ code: 'QTN_ALREADY_DECIDED' });
    (globalThis as Record<string, unknown>).__quoteRef = issued.reference;
  });

  it('supersedes the live quote on reissue and refuses decisions after expiry', async () => {
    const second = await issueRentalQuotation(opsId, companyId, requestId);
    const declined = await decideOwnRentalQuotation(customerUserId, companyId, second.id, {
      decision: 'DECLINED', reason: 'Travel plans are changing',
    });
    expect(declined.status).toBe('DECLINED');
    const third = await issueRentalQuotation(opsId, companyId, requestId);
    await prisma.rentalQuotation.update({
      where: { id: third.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await expect(decideOwnRentalQuotation(customerUserId, companyId, third.id, {
      decision: 'ACCEPTED', reason: 'Accepting after the expiry',
    })).rejects.toMatchObject({ code: 'QTN_EXPIRED' });
  });

  it('lets staff still confirm citing the accepted quotation reference', async () => {
    await setSetting('rental.deposit_policy', { kind: 'NOT_REQUIRED' });
    await setSetting('fleet.vehicle_between_job_buffer_minutes', 0);
    await setSetting('fleet.driver_between_job_buffer_minutes', 0);
    const vehicle = await prisma.vehicle.create({
      data: { companyId, registrationNumber: `QUO-${randomUUID().slice(0, 6).toUpperCase()}`, make: 'Test', model: 'Coaster', category: 'Integration fixture', seatCount: 12 },
    });
    const acceptedReference = (globalThis as Record<string, unknown>).__quoteRef as string;
    await confirmRentalRequest(opsId, companyId, requestId, {
      vehicleId: vehicle.id,
      acceptedByName: 'Quotation test customer',
      acceptanceAt: '2027-03-01',
      acceptanceReference: acceptedReference,
      reason: 'Customer accepted the portal quotation',
    });
    const request = await prisma.rentalRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request).toMatchObject({ status: 'Confirmed', acceptanceReference: acceptedReference });
  });
});
