import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/prisma', () => ({ getPrisma: vi.fn() }));

import { isUniqueRoleAssignmentError } from './permissions';

describe('unique role-assignment error detection', () => {
  it('recognizes the stable Prisma unique-constraint code without loading generated client code', () => {
    expect(isUniqueRoleAssignmentError(Object.assign(new Error('unique constraint'), { code: 'P2002' }))).toBe(true);
  });

  it('rejects other error codes and values', () => {
    expect(isUniqueRoleAssignmentError({ code: 'P2002' })).toBe(false);
    expect(isUniqueRoleAssignmentError(Object.assign(new Error('not unique'), { code: 'P2025' }))).toBe(false);
    expect(isUniqueRoleAssignmentError(new Error('duplicate'))).toBe(false);
    expect(isUniqueRoleAssignmentError(null)).toBe(false);
    expect(isUniqueRoleAssignmentError('P2002')).toBe(false);
  });
});
