import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn() }));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));
vi.mock('./permissions', () => ({
  PermissionDeniedError: class PermissionDeniedError extends Error {},
}));

import { bootstrapOperatorCompany, CompanyAlreadyProvisionedError } from './company-bootstrap';
import { PermissionDeniedError } from './permissions';

function makeTransaction({ admin = true, existingCompanies = 0 }: { admin?: boolean; existingCompanies?: number } = {}) {
  const tx = {
    $executeRaw: vi.fn(),
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'admin-user', status: 'ACTIVE' }) },
    userRoleAssignment: { findFirst: vi.fn().mockResolvedValue(admin ? { id: 'admin-role' } : null) },
    company: {
      count: vi.fn().mockResolvedValue(existingCompanies),
      create: vi.fn().mockResolvedValue({ id: 'company-1', name: 'Richie Transport Services' }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const transaction = vi.fn((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  mocks.getPrisma.mockReturnValue({ $transaction: transaction });
  return { tx, transaction };
}

describe('one-time operator company bootstrap', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates only the confirmed operator company and audits it in the same transaction', async () => {
    const { tx, transaction } = makeTransaction();
    const company = await bootstrapOperatorCompany({ actorEmail: 'ADMIN@example.com' });
    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' }, select: { id: true, status: true },
    });
    expect(tx.company.create).toHaveBeenCalledWith({ data: { name: 'Richie Transport Services' } });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-user', companyId: 'company-1', action: 'OPERATOR_COMPANY_BOOTSTRAPPED',
        entityId: 'company-1', summary: { provisioning: 'one_time_local_cli' },
      }),
    });
    expect(company).toEqual({ id: 'company-1', name: 'Richie Transport Services' });
  });

  it('denies a non-administrator and creates no company', async () => {
    const { tx } = makeTransaction({ admin: false });
    await expect(bootstrapOperatorCompany({ actorEmail: 'user@example.com' }))
      .rejects.toBeInstanceOf(PermissionDeniedError);
    expect(tx.company.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it('refuses to provision a second company', async () => {
    const { tx } = makeTransaction({ existingCompanies: 1 });
    await expect(bootstrapOperatorCompany({ actorEmail: 'admin@example.com' }))
      .rejects.toBeInstanceOf(CompanyAlreadyProvisionedError);
    expect(tx.company.create).not.toHaveBeenCalled();
  });

  it('rejects malformed actor email before opening a transaction', async () => {
    makeTransaction();
    await expect(bootstrapOperatorCompany({ actorEmail: 'not-an-email' })).rejects.toThrow();
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });
});
