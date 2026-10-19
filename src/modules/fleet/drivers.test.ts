import { beforeEach, describe, expect, it, vi } from 'vitest';
import { driverImportHeaders } from './driver-import-constants';
import { importDriversFromCsv, previewDriverImport } from './drivers';

const mocks = vi.hoisted(() => ({
  resolvePermission: vi.fn(),
  getPrisma: vi.fn(),
}));

vi.mock('@/modules/auth/permissions', () => ({ resolvePermission: mocks.resolvePermission }));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));

function makeCsv(names: string[]) {
  return [driverImportHeaders.join(','), ...names.map((name) => `${name},,,,,`)].join('\n');
}

function setup(existingNames: string[] = []) {
  let nextId = 0;
  const createDriver = vi.fn(async ({ data }: { data: { fullName: string } }) => ({
    id: `imported-${++nextId}`,
    fullName: data.fullName,
  }));
  const createAuditEvent = vi.fn();
  const transactionClient = {
    driver: { create: createDriver },
    auditEvent: { create: createAuditEvent },
  };
  const prisma = {
    company: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    driver: {
      findMany: vi.fn().mockResolvedValue(existingNames.map((fullName) => ({ fullName }))),
    },
    $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient)),
  };
  mocks.getPrisma.mockReturnValue(prisma);
  return { prisma, createDriver, createAuditEvent };
}

describe('driver import service duplicate warnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePermission.mockResolvedValue({ allowed: true, scopes: ['GLOBAL'] });
  });

  it('avoids the driver-register lookup when CSV syntax or headers are invalid', async () => {
    const { prisma } = setup();
    const preview = await previewDriverImport({
      actorId: 'admin-1', companyId: 'company-1', csv: 'unexpectedHeader\nDriver One',
    });

    expect(preview.fileErrors.length).toBeGreaterThan(0);
    expect(prisma.driver.findMany).not.toHaveBeenCalled();
  });

  it('keeps possible-duplicate warnings non-blocking and creates every valid row separately', async () => {
    const { prisma, createDriver, createAuditEvent } = setup(['Existing Driver']);
    const csv = makeCsv(['Existing Driver', 'existing driver']);
    const preview = await previewDriverImport({ actorId: 'admin-1', companyId: 'company-1', csv });

    expect(preview).toMatchObject({ totalRows: 2, validRows: 2, invalidRows: 0, canImport: true });
    expect(preview.rows[0]?.warnings).toHaveLength(2);
    expect(preview.rows[1]?.warnings).toHaveLength(2);

    const result = await importDriversFromCsv({
      actorId: 'admin-1', companyId: 'company-1', csv, reason: 'Import reviewed possible name matches',
    });
    expect(result.importedCount).toBe(2);
    expect(new Set(result.drivers.map((driver: { id: string }) => driver.id)).size).toBe(2);
    expect(createDriver).toHaveBeenCalledTimes(2);
    expect(createAuditEvent).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
