import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { createBooking } from '../bookings/bookings';
import {
  ClientBindingNotFoundError,
  DashboardValidationError,
  bindUserClient,
  getCorporateDashboard,
  revokeUserClientBinding,
} from './dashboard';

const prisma = getPrisma();
let companyId = '';
let managerId = '';
let hrUserId = '';
let hrUser2Id = '';
let clientId = '';
let otherClientId = '';
let bindingId = '';
let foreignCompanyId = '';

describe('corporate dashboard with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const foreignCompany = await prisma.company.create({ data: { name: `Elsewhere ${randomUUID()}` } });
    foreignCompanyId = foreignCompany.id;
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const company = await prisma.company.create({ data: { name: `Dashboard ${randomUUID()}` } });
    companyId = company.id;
    const makeUser = async (name: string) => prisma.user.create({
      data: { name, email: `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
    });
    const [manager, hrUser, hrUser2] = await Promise.all([
      makeUser('Dashboard Manager'), makeUser('Client HR'), makeUser('Unbound HR'),
    ]);
    managerId = manager.id;
    hrUserId = hrUser.id;
    hrUser2Id = hrUser2.id;
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    for (const userId of [hrUserId, hrUser2Id]) {
      await prisma.userRoleAssignment.create({
        data: { userId, companyId, roleCode: 'CORP_HR_ADMIN', reason: 'Integration setup', assignedById: null },
      });
    }
    const [client, otherClient] = await Promise.all([
      prisma.client.create({ data: { companyId, name: `Bound Client ${randomUUID()}` } }),
      prisma.client.create({ data: { companyId, name: `Foreign Client ${randomUUID()}` } }),
    ]);
    clientId = client.id;
    otherClientId = otherClient.id;
    const [employee, foreignEmployee] = await Promise.all([
      prisma.employee.create({ data: { companyId, clientId, fullName: 'Bound Employee', transportEligible: true } }),
      prisma.employee.create({ data: { companyId, clientId: otherClientId, fullName: 'Foreign Employee', transportEligible: true } }),
    ]);
    await createBooking({
      employeeId: employee.id, contractId: null, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2027-10-04',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Dashboard fixture booking',
    }, managerId, companyId);
    await createBooking({
      employeeId: foreignEmployee.id, contractId: null, routeId: null, bookingType: 'HOME_TO_OFFICE', journeyDate: '2027-10-04',
      pickupLocationId: null, dropoffLocationId: null, notes: null, reason: 'Foreign client fixture booking',
    }, managerId, companyId);
    const result = await bindUserClient(
      { userId: hrUserId, clientId, reason: 'Binding HR login to its client for tests' }, managerId, companyId,
    );
    bindingId = result.bindingId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('shows only the bound client\u2019s records and no restricted employee fields', async () => {
    const dashboard = await getCorporateDashboard({ actorId: hrUserId, companyId });
    expect(dashboard.client.id).toBe(clientId);
    expect(dashboard.bookings).toHaveLength(1);
    expect(dashboard.bookings[0].employeeName).toBe('Bound Employee');
    expect(dashboard.employees.map((employee) => employee.fullName)).toEqual(['Bound Employee']);
    expect(Object.keys(dashboard.employees[0]).sort()).toEqual([
      'accountStatus', 'department', 'fullName', 'transportEligible',
    ]);
    expect(dashboard.bookingCountsByStatus).toEqual([{ status: 'Pending', count: 1 }]);
  });

  it('denies unbound HR accounts and non-HR users without a binding', async () => {
    await expect(getCorporateDashboard({ actorId: hrUser2Id, companyId }))
      .rejects.toBeInstanceOf(ClientBindingNotFoundError);
  });

  it('refuses a second active binding and resumes after revocation', async () => {
    await expect(bindUserClient(
      { userId: hrUserId, clientId: otherClientId, reason: 'Trying to bind to a second client' }, managerId, companyId,
    )).rejects.toBeInstanceOf(DashboardValidationError);
    await revokeUserClientBinding({
      actorId: managerId, companyId, bindingId, reason: 'HR person moved to another client',
    });
    await expect(getCorporateDashboard({ actorId: hrUserId, companyId }))
      .rejects.toBeInstanceOf(ClientBindingNotFoundError);
    const rebound = await bindUserClient(
      { userId: hrUserId, clientId: otherClientId, reason: 'Rebinding after the HR move' }, managerId, companyId,
    );
    const dashboard = await getCorporateDashboard({ actorId: hrUserId, companyId });
    expect(rebound.clientId).toBe(otherClientId);
    expect(dashboard.employees.map((employee) => employee.fullName)).toEqual(['Foreign Employee']);
  });

  it('cannot be reached with a binding from another company', async () => {
    await expect(getCorporateDashboard({ actorId: hrUserId, companyId: foreignCompanyId }))
      .rejects.toBeInstanceOf(Error);
  });
});
