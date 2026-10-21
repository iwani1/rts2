import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@/server/prisma';
import { PermissionDeniedError } from '@/modules/auth/permissions';
import {
  ContractClientNotFoundError,
  ContractNotDraftError,
  ContractNotFoundError,
  ContractPolicyError,
  ContractTransitionNotAllowedError,
  InvalidContractCursorError,
  createContract,
  getContract,
  listContracts,
  transitionContract,
  updateContractDraft,
} from './contracts';

const prisma = getPrisma();
let companyId = '';
let otherCompanyId = '';
let adminId = '';
let managerId = '';
let clientId = '';
let otherClientId = '';
let archivedClientId = '';

async function makeUser(label: string) {
  return prisma.user.create({
    data: { name: label, email: `${label.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}@example.invalid`, status: 'ACTIVE' },
  });
}

const contractInput = (overrides: Record<string, unknown> = {}) => ({
  clientId,
  serviceType: 'Staff busing',
  startDate: '2026-01-01',
  endDate: '2027-12-31',
  renewalDate: null,
  routesAndStops: null,
  serviceDaysAndShifts: null,
  vehicleRequirements: null,
  pricingModel: null,
  billingFrequency: null,
  paymentTerms: null,
  serviceLevelTargets: null,
  notes: null,
  reason: 'Integration test contract entry',
  ...overrides,
});

async function createActiveContract(overrides: Record<string, unknown> = {}) {
  const draft = await createContract(contractInput(overrides), managerId, companyId);
  await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting signed terms for approval' }, managerId, companyId, draft.id);
  return transitionContract({ toStatus: 'Active', reason: 'Contract approved and countersigned' }, managerId, companyId, draft.id);
}

describe('corporate contracts with PostgreSQL persistence', () => {
  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL test database');
    const databaseName = new URL(databaseUrl).pathname.slice(1).split('?')[0];
    if (!databaseName.endsWith('_test')) throw new Error('Refusing integration tests unless the database name ends with _test');
    const [company, otherCompany, admin, manager] = await Promise.all([
      prisma.company.create({ data: { name: `Contracts ${randomUUID()}` } }),
      prisma.company.create({ data: { name: `Other contracts ${randomUUID()}` } }),
      makeUser('Contract Super Admin'),
      makeUser('Contract Ops Manager'),
    ]);
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    adminId = admin.id;
    managerId = manager.id;
    await prisma.userRoleAssignment.create({
      data: { userId: adminId, companyId: null, roleCode: 'SUPER_ADMIN', reason: 'Integration setup', assignedById: null },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: managerId, companyId, roleCode: 'OPS_MANAGER', reason: 'Integration setup', assignedById: null },
    });
    const [client, otherClient, archivedClient] = await Promise.all([
      prisma.client.create({ data: { companyId, name: `Contract Client ${randomUUID()}` } }),
      prisma.client.create({ data: { companyId: otherCompanyId, name: `Other Client ${randomUUID()}` } }),
      prisma.client.create({ data: { companyId, name: `Archived Client ${randomUUID()}`, archivedAt: new Date() } }),
    ]);
    clientId = client.id;
    otherClientId = otherClient.id;
    archivedClientId = archivedClient.id;
  });

  afterAll(async () => {
    // Integration tests run against a disposable *_test database; recreate it when a clean slate is needed.
    await prisma.$disconnect();
  });

  it('creates a Draft contract with a generated reference and opening history', async () => {
    const contract = await createContract(contractInput(), managerId, companyId);
    expect(contract.reference).toMatch(/^CON-[A-F0-9]{16}$/);
    expect(contract.status).toBe('Draft');
    expect(contract.clientId).toBe(clientId);
    expect(contract.pricingModel).toBeNull();
    const detail = await getContract({ actorId: managerId, companyId, contractId: contract.id });
    expect(detail.history.map((entry) => [entry.fromStatus, entry.toStatus])).toEqual([[null, 'Draft']]);
    const audit = await prisma.auditEvent.findFirst({
      where: { companyId, entityType: 'CONTRACT', entityId: contract.id, action: 'CONTRACT_CREATED' },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects clients from another company or archived clients', async () => {
    await expect(createContract(contractInput({ clientId: otherClientId }), managerId, companyId))
      .rejects.toBeInstanceOf(ContractClientNotFoundError);
    await expect(createContract(contractInput({ clientId: archivedClientId }), managerId, companyId))
      .rejects.toBeInstanceOf(ContractClientNotFoundError);
  });

  it('allows Draft amendments, blocks approval without dates, then activates after return to Draft', async () => {
    const draft = await createContract(contractInput({ startDate: null, endDate: null }), managerId, companyId);
    const amended = await updateContractDraft(contractInput({ serviceType: 'Staff busing and logistics', startDate: null, endDate: null }), managerId, companyId, draft.id);
    expect(amended.serviceType).toBe('Staff busing and logistics');
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Submitting signed terms for approval' }, managerId, companyId, draft.id);
    await expect(updateContractDraft(contractInput(), managerId, companyId, draft.id)).rejects.toBeInstanceOf(ContractNotDraftError);
    await expect(transitionContract({ toStatus: 'Active', reason: 'Contract approved and countersigned' }, managerId, companyId, draft.id))
      .rejects.toBeInstanceOf(ContractPolicyError);
    await transitionContract({ toStatus: 'Draft', reason: 'Returning to add the agreed dates' }, managerId, companyId, draft.id);
    await updateContractDraft(contractInput(), managerId, companyId, draft.id);
    await transitionContract({ toStatus: 'Pending Approval', reason: 'Resubmitting with agreed dates' }, managerId, companyId, draft.id);
    const active = await transitionContract({ toStatus: 'Active', reason: 'Contract approved and countersigned' }, managerId, companyId, draft.id);
    expect(active.status).toBe('Active');
    const detail = await getContract({ actorId: managerId, companyId, contractId: draft.id });
    expect(detail.history.map((entry) => entry.toStatus)).toEqual(
      ['Active', 'Pending Approval', 'Draft', 'Pending Approval', 'Draft'],
    );
  });

  it('walks the lifecycle and renews an Expired contract only with a new future end date', async () => {
    const active = await createActiveContract();
    const suspended = await transitionContract({ toStatus: 'Suspended', reason: 'Client paused operations temporarily' }, managerId, companyId, active.id);
    expect(suspended.warnings.some((warning) => warning.includes('suspended'))).toBe(true);
    await transitionContract({ toStatus: 'Active', reason: 'Client resumed operations' }, managerId, companyId, active.id);
    const expired = await transitionContract({ toStatus: 'Expired', reason: 'Contract term ended without renewal' }, managerId, companyId, active.id);
    expect(expired.warnings.some((warning) => warning.includes('expired'))).toBe(true);
    await expect(transitionContract({ toStatus: 'Active', reason: 'Renewal approved by operations' }, managerId, companyId, active.id))
      .rejects.toBeInstanceOf(ContractPolicyError);
    await expect(transitionContract(
      { toStatus: 'Active', reason: 'Renewal approved by operations', renewalEndDate: '2020-01-01' }, managerId, companyId, active.id,
    )).rejects.toBeInstanceOf(ContractPolicyError);
    const renewed = await transitionContract(
      { toStatus: 'Active', reason: 'Renewal approved by operations', renewalStartDate: '2028-01-01', renewalEndDate: '2028-12-31' },
      managerId, companyId, active.id,
    );
    expect(renewed.status).toBe('Active');
    expect(renewed.startDate).toBe('2028-01-01');
    expect(renewed.endDate).toBe('2028-12-31');
    const terminated = await transitionContract({ toStatus: 'Terminated', reason: 'Client terminated the agreement early' }, managerId, companyId, active.id);
    expect(terminated.status).toBe('Terminated');
    await expect(transitionContract({ toStatus: 'Active', reason: 'Attempting to revive a terminated contract' }, managerId, companyId, active.id))
      .rejects.toBeInstanceOf(ContractTransitionNotAllowedError);
  });

  it('rejects disallowed transitions across the matrix', async () => {
    const draft = await createContract(contractInput(), managerId, companyId);
    await expect(transitionContract({ toStatus: 'Active', reason: 'Skipping approval entirely' }, managerId, companyId, draft.id))
      .rejects.toBeInstanceOf(ContractTransitionNotAllowedError);
    await expect(transitionContract({ toStatus: 'Terminated', reason: 'Terminating a draft directly' }, managerId, companyId, draft.id))
      .rejects.toBeInstanceOf(ContractTransitionNotAllowedError);
    const active = await createActiveContract();
    await expect(transitionContract({ toStatus: 'Draft', reason: 'Rewriting an active contract' }, managerId, companyId, active.id))
      .rejects.toBeInstanceOf(ContractTransitionNotAllowedError);
    await expect(transitionContract({ toStatus: 'Pending Approval', reason: 'Re-approving an active contract' }, managerId, companyId, active.id))
      .rejects.toBeInstanceOf(ContractTransitionNotAllowedError);
  });

  it('refuses to reactivate a suspended contract whose end date has passed', async () => {
    const active = await createActiveContract({ startDate: '2020-01-01', endDate: '2020-12-31' });
    expect(active.warnings.some((warning) => warning.includes('end date has passed'))).toBe(true);
    await transitionContract({ toStatus: 'Suspended', reason: 'Client paused operations temporarily' }, managerId, companyId, active.id);
    await expect(transitionContract({ toStatus: 'Active', reason: 'Client resumed operations' }, managerId, companyId, active.id))
      .rejects.toBeInstanceOf(ContractPolicyError);
  });

  it('enforces the transition table and append-only history in the database', async () => {
    const draft = await createContract(contractInput(), managerId, companyId);
    await expect(prisma.$executeRaw`UPDATE "Contract" SET "status" = 'Active' WHERE "id" = ${draft.id}`)
      .rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE "ContractStatusHistory" SET "reason" = 'rewritten' WHERE "contractId" = ${draft.id}`)
      .rejects.toThrow(/append-only/);
    const after = await getContract({ actorId: managerId, companyId, contractId: draft.id });
    expect(after.contract.status).toBe('Draft');
  });

  it('denies cross-company access and hides other-company contracts', async () => {
    const contract = await createContract(contractInput(), managerId, companyId);
    await expect(getContract({ actorId: managerId, companyId: otherCompanyId, contractId: contract.id }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(getContract({ actorId: managerId, companyId, contractId: 'missing-contract' }))
      .rejects.toBeInstanceOf(ContractNotFoundError);
    await expect(listContracts({ actorId: managerId, companyId, cursor: 'missing-cursor' }))
      .rejects.toBeInstanceOf(InvalidContractCursorError);
    const list = await listContracts({ actorId: managerId, companyId, status: 'Draft', clientId });
    expect(list.contracts.every((entry) => entry.clientId === clientId && entry.status === 'Draft')).toBe(true);
    expect(list.contracts.some((entry) => entry.id === contract.id)).toBe(true);
  });
});
