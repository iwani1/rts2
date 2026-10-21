import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import { employeeImportHeaders } from './employee-import-constants';
import {
  EmployeeImportValidationError,
  EmployeeReferenceTakenError,
  archiveEmployee,
  createEmployee,
  exportEmployeesCsv,
  getEmployee,
  importEmployeesFromCsv,
  listEmployees,
  previewEmployeeImport,
  updateEmployee,
} from './employees';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let managerId = '';
let dispatcherId = '';
let clientId = '';
let otherClientId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

const employeeInput = (overrides: Record<string, unknown> = {}) => ({
  clientId,
  reference: null,
  fullName: `Employee ${randomUUID().slice(0, 8)}`,
  telephone: null,
  email: null,
  homeAddress: null,
  department: null,
  workLocation: null,
  shift: null,
  approvedPickupLocation: null,
  approvedDropoffLocation: null,
  accountStatus: null,
  transportEligible: null,
  accessibilityNeeds: null,
  notes: null,
  reason: 'Integration test employee entry',
  ...overrides,
});

const csvFor = (rows: Array<Record<string, string>>) => [
  employeeImportHeaders.join(','),
  ...rows.map((row) => employeeImportHeaders.map((header) => row[header] ?? '').join(',')),
].join('\n');

describe('employee register and CSV import with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, manager, dispatcher] = await Promise.all([
      prisma.company.create({ data: { name: `Employees ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other employees ${randomUUID()}` } }),
      makeUser('Employee Ops Manager'),
      makeUser('Employee Dispatcher'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    managerId = manager.id;
    dispatcherId = dispatcher.id;
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: dispatcherId, companyId, roleCode: 'DISPATCHER', reason: 'Integration setup', assignedById: null },
    });
    const [client, otherClient] = await Promise.all([
      prisma.client.create({ data: { companyId, name: `Employee Client ${randomUUID()}` } }),
      prisma.client.create({ data: { companyId: otherCompanyId, name: `Other Client ${randomUUID()}` } }),
    ]);
    clientId = client.id;
    otherClientId = otherClient.id;
  });

  afterAll(async () => {
    // Integration tests run against a disposable *_test database; recreate it when a clean slate is needed.
    await prisma.$disconnect();
  });

  it('creates, updates (including the eligibility toggle), and archives an employee', async () => {
    const created = await createEmployee(employeeInput({ reference: `EMP-${randomUUID().slice(0, 6)}` }), managerId, companyId);
    expect(created.transportEligible).toBeNull();
    const updated = await updateEmployee(
      employeeInput({ clientId, fullName: created.fullName, transportEligible: true, shift: 'Morning' }),
      managerId, companyId, created.id,
    );
    expect(updated.transportEligible).toBe(true);
    const eligible = await listEmployees({ actorId: managerId, companyId, transportEligible: 'true' });
    expect(eligible.employees.some((entry) => entry.id === created.id)).toBe(true);
    const detail = await getEmployee({ actorId: managerId, companyId, employeeId: created.id });
    expect(detail.history.map((entry) => entry.action)).toContain('EMPLOYEE_CREATED');
    await archiveEmployee({ actorId: managerId, companyId, employeeId: created.id, reason: 'Employment ended; archiving record' });
    await expect(getEmployee({ actorId: managerId, companyId, employeeId: created.id })).rejects.toThrow();
  });

  it('enforces unique references and company isolation, including restricted fields', async () => {
    const reference = `EMP-${randomUUID().slice(0, 6)}`;
    await createEmployee(employeeInput({ reference, homeAddress: 'House 1, Restricted Street', accessibilityNeeds: 'Wheelchair access' }), managerId, companyId);
    await expect(createEmployee(employeeInput({ reference }), managerId, companyId)).rejects.toBeInstanceOf(EmployeeReferenceTakenError);
    await expect(createEmployee(employeeInput({ clientId: otherClientId }), managerId, companyId)).rejects.toThrow();
    await expect(listEmployees({ actorId: managerId, companyId: otherCompanyId })).rejects.toBeInstanceOf(PermissionDeniedError);
    // Dispatcher roster-minimum scope fails closed until its field projection is approved.
    await expect(listEmployees({ actorId: dispatcherId, companyId })).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('previews an import with row errors and likely-duplicate warnings, importing nothing', async () => {
    const existing = await createEmployee(employeeInput({ fullName: 'Existing Person', telephone: '+233200000001' }), managerId, companyId);
    const csv = csvFor([
      { fullName: 'New Person', telephone: '+233200000099', transportEligible: 'TRUE' },
      { fullName: 'Existing Person', telephone: '+233 20 000 0001' },
      { fullName: 'Bad Email', email: 'nope' },
    ]);
    const preview = await previewEmployeeImport({ actorId: managerId, companyId, clientId, csv });
    expect(preview.totalRows).toBe(3);
    expect(preview.validRows).toBe(2);
    expect(preview.invalidRows).toBe(1);
    expect(preview.canImport).toBe(false);
    expect(preview.rows[1].warnings.some((warning) => warning.includes(existing.fullName))).toBe(true);
    await expect(importEmployeesFromCsv({ actorId: managerId, companyId, clientId, csv, reason: 'Importing HR spreadsheet batch' }))
      .rejects.toBeInstanceOf(EmployeeImportValidationError);
    const after = await listEmployees({ actorId: managerId, companyId, search: 'New Person' });
    expect(after.employees).toHaveLength(0);
  });

  it('imports a fully valid batch atomically and exports without restricted fields', async () => {
    const csv = csvFor([
      { fullName: 'Imported One', reference: `IMP-${randomUUID().slice(0, 6)}`, transportEligible: 'FALSE', homeAddress: 'Secret Home 1' },
      { fullName: 'Imported Two', transportEligible: 'TRUE' },
    ]);
    const result = await importEmployeesFromCsv({ actorId: managerId, companyId, clientId, csv, reason: 'Importing HR spreadsheet batch' });
    expect(result.importedCount).toBe(2);
    const list = await listEmployees({ actorId: managerId, companyId, search: 'Imported' });
    expect(list.employees).toHaveLength(2);
    const exported = await exportEmployeesCsv({ actorId: managerId, companyId, clientId });
    expect(exported.csv).toContain('Imported One');
    expect(exported.csv).not.toContain('Secret Home 1');
    expect(exported.csv.split('\n')[0]).not.toContain('homeAddress');
    const audit = await prisma.auditEvent.findFirst({
      where: { companyId, action: 'EMPLOYEE_REGISTER_EXPORTED' }, orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });
});
