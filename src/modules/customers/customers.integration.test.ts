import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { assignRole, PermissionDeniedError } from '@/modules/auth/permissions';
import {
  archiveCustomer,
  createCustomer,
  CustomerImportValidationError,
  CustomerNotFoundError,
  getCustomer,
  importCustomersFromCsv,
  listCustomers,
  previewCustomerImport,
  updateCustomer,
} from './customers';
import { customerImportHeaders } from './customer-import-constants';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let adminId = '';
let managerId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

const customerInput = (overrides: Record<string, unknown> = {}) => ({
  reference: null,
  displayName: `Customer ${randomUUID()}`,
  contactPerson: null,
  telephone: null,
  email: null,
  billingDetails: null,
  customerType: null,
  status: null,
  notes: null,
  reason: 'Integration test customer entry',
  ...overrides,
});

describe('customer register with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, admin, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Customers ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other customers ${randomUUID()}` } }),
      makeUser('Customer Super Admin'),
      makeUser('Customer Ops Manager'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    adminId = admin.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: adminId, roleCode: 'SUPER_ADMIN', assignedById: adminId, reason: 'Customer integration test administrator' },
    });
    await assignRole({ actorId: adminId, targetUserId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Customer integration test operations manager' });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('creates and searches company-scoped records with optional reference and no business defaults', async () => {
    const input = customerInput({
      reference: 'CUSTOMER-REF-A', displayName: 'Example Transport Client',
      contactPerson: 'Ama Example', telephone: '+233 20 000 0000', email: 'ama@example.invalid',
      customerType: 'Organisation', status: 'Active',
    });
    const customer = await createCustomer(input, managerId, companyId);
    expect(customer.reference).toBe('CUSTOMER-REF-A');
    expect(customer.customerType).toBe('Organisation');
    expect(customer.status).toBe('Active');
    const stored = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(stored.companyId).toBe(companyId);
    expect(stored.billingDetails).toBeNull();
    const searched = await listCustomers({ actorId: managerId, companyId, search: 'Ama Example' });
    expect(searched.customers.map(({ id }) => id)).toContain(customer.id);
    const audit = await prisma.auditEvent.findFirst({ where: { entityType: 'CUSTOMER', entityId: customer.id, action: 'CUSTOMER_CREATED' } });
    expect(audit?.summary).toEqual({ reason: input.reason });
  });

  it('enforces unique optional references within a company and prevents cross-company access', async () => {
    const existing = await createCustomer(customerInput({ reference: 'SAME-REF' }), managerId, companyId);
    await expect(createCustomer(customerInput({ reference: 'SAME-REF' }), managerId, companyId)).rejects.toMatchObject({ code: 'P2002' });
    await expect(getCustomer({ actorId: managerId, companyId: otherCompanyId, customerId: existing.id })).rejects.toBeInstanceOf(PermissionDeniedError);
    const otherCompanyManager = await makeUser('Other Customer Ops Manager');
    await assignRole({ actorId: adminId, targetUserId: otherCompanyManager.id, companyId: otherCompanyId, roleCode: 'OPS_MANAGER', reason: 'Other company access boundary test' });
    await expect(getCustomer({ actorId: otherCompanyManager.id, companyId: otherCompanyId, customerId: existing.id })).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
  });

  it('previews all customer CSV rows and imports no rows when any row is invalid', async () => {
    const beforeCount = await prisma.customer.count({ where: { companyId } });
    const csv = `${customerImportHeaders.join(',')}\nValid Row,IMPORT-VALID,,,,,,,\n,IMPORT-INVALID,,,,,,,\n`;
    const preview = await previewCustomerImport({ actorId: managerId, companyId, csv });
    expect(preview).toMatchObject({ totalRows: 2, validRows: 1, invalidRows: 1, canImport: false });
    expect(preview.rows[1]?.errors.join(' ')).toContain('displayName');
    await expect(importCustomersFromCsv({
      actorId: managerId, companyId, csv, reason: 'Import archived customer records',
    })).rejects.toBeInstanceOf(CustomerImportValidationError);
    expect(await prisma.customer.count({ where: { companyId } })).toBe(beforeCount);
  });

  it('imports a fully valid customer CSV atomically and audits each created record', async () => {
    const csv = `${customerImportHeaders.join(',')}\nImported One,IMPORT-ONE,,,,,Organisation,Active,\nImported Two,,,,,,,,\n`;
    const result = await importCustomersFromCsv({
      actorId: managerId, companyId, csv, reason: 'Import verified customer register rows',
    });
    expect(result.importedCount).toBe(2);
    const first = result.customers[0];
    expect(first).toMatchObject({ displayName: 'Imported One', reference: 'IMPORT-ONE' });
    const details = await getCustomer({ actorId: managerId, companyId, customerId: first!.id });
    expect(details.customer).toMatchObject({ customerType: 'Organisation', status: 'Active' });
    expect(details.history[0]).toMatchObject({ action: 'CUSTOMER_IMPORTED', reason: 'Import verified customer register rows' });
    const event = await prisma.auditEvent.findFirst({ where: { entityId: first!.id, action: 'CUSTOMER_IMPORTED' } });
    expect(event?.summary).toEqual({ reason: 'Import verified customer register rows', source: 'CSV_IMPORT', rowNumber: 2 });
  });

  it('rejects references already present in the company without allowing an import', async () => {
    await createCustomer(customerInput({ reference: 'IMPORT-EXISTING' }), managerId, companyId);
    const csv = `${customerImportHeaders.join(',')}\nAnother Name,IMPORT-EXISTING,,,,,,,\n`;
    const preview = await previewCustomerImport({ actorId: managerId, companyId, csv });
    expect(preview.canImport).toBe(false);
    expect(preview.rows[0]?.errors.join(' ')).toContain('already exists in this company');
  });

  it('updates with audited history and archives without deleting the customer', async () => {
    const customer = await createCustomer(customerInput({ reference: 'ARCHIVE-REF' }), managerId, companyId);
    const updated = await updateCustomer(customerInput({
      reference: customer.reference,
      displayName: customer.displayName,
      telephone: '+233 30 000 0000',
      reason: 'Update customer contact telephone',
    }), managerId, companyId, customer.id);
    expect(updated.telephone).toBe('+233 30 000 0000');
    const details = await getCustomer({ actorId: managerId, companyId, customerId: customer.id });
    expect(details.history.map(({ action }) => action)).toContain('CUSTOMER_CREATED');
    expect(details.history.map(({ action }) => action)).toContain('CUSTOMER_UPDATED');
    const archived = await archiveCustomer({ actorId: managerId, companyId, customerId: customer.id, reason: 'Customer requested archive of record' });
    expect(archived.archivedAt).toBeInstanceOf(Date);
    await expect(getCustomer({ actorId: managerId, companyId, customerId: customer.id })).rejects.toBeInstanceOf(CustomerNotFoundError);
    expect(await prisma.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
  });
});
