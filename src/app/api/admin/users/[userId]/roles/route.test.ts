import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrisma: vi.fn(),
  assignRole: vi.fn(),
  revokeRoleAssignment: vi.fn(),
  isActiveSuperAdmin: vi.fn(),
  isUniqueRoleAssignmentError: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  getAuth: () => ({ api: { getSession: mocks.getSession } }),
}));
vi.mock('@/server/prisma', () => ({ getPrisma: mocks.getPrisma }));
vi.mock('@/modules/auth/permissions', () => ({
  assignRole: mocks.assignRole,
  revokeRoleAssignment: mocks.revokeRoleAssignment,
  isActiveSuperAdmin: mocks.isActiveSuperAdmin,
  isUniqueRoleAssignmentError: mocks.isUniqueRoleAssignmentError,
  PermissionDeniedError: class PermissionDeniedError extends Error {},
}));

import { GET, POST } from './route';
import { DELETE } from '../../../role-assignments/[assignmentId]/route';
import { PermissionDeniedError } from '@/modules/auth/permissions';

const context = { params: Promise.resolve({ userId: 'target-user' }) };
const assignmentContext = { params: Promise.resolve({ assignmentId: 'assignment-1' }) };
const session = { user: { id: 'actor-admin' } };

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('admin user-role API', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires a signed-in session before listing roles', async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/admin/users/target-user/roles'), context);
    expect(response.status).toBe(401);
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it('restricts role-directory reads to active global Super Administrators', async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.isActiveSuperAdmin.mockResolvedValue(false);
    const response = await GET(new Request('http://localhost/api/admin/users/target-user/roles'), context);
    expect(response.status).toBe(403);
    expect(mocks.getPrisma).not.toHaveBeenCalled();
  });

  it('lists the target account, role catalogue and assignment history for a Super Administrator', async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.isActiveSuperAdmin.mockResolvedValue(true);
    const data = { id: 'target-user', name: 'Target', email: 'target@example.invalid', status: 'ACTIVE' };
    const assignments = [{ id: 'assignment-1', roleCode: 'DRIVER' }];
    mocks.getPrisma.mockReturnValue({
      user: { findUnique: vi.fn().mockResolvedValue(data) },
      role: { findMany: vi.fn().mockResolvedValue([{ code: 'DRIVER', name: 'Driver' }]) },
      userRoleAssignment: { findMany: vi.fn().mockResolvedValue(assignments) },
    });
    const response = await GET(new Request('http://localhost/api/admin/users/target-user/roles'), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      user: data,
      roles: [{ code: 'DRIVER', name: 'Driver' }],
      assignments,
    });
  });

  it('assigns only the target in the URL and derives the actor from the session', async () => {
    mocks.getSession.mockResolvedValue(session);
    const assignment = { id: 'new-assignment', roleCode: 'DRIVER' };
    mocks.assignRole.mockResolvedValue(assignment);
    const request = jsonRequest('http://localhost/api/admin/users/target-user/roles', {
      roleCode: 'DRIVER', companyId: 'company-1', reason: 'Approved company driver assignment',
    });
    const response = await POST(request, context);
    expect(response.status).toBe(201);
    expect(mocks.assignRole).toHaveBeenCalledWith({
      roleCode: 'DRIVER', companyId: 'company-1', reason: 'Approved company driver assignment',
      actorId: 'actor-admin', targetUserId: 'target-user',
    });
  });

  it('rejects privilege changes when the role service denies the actor', async () => {
    mocks.getSession.mockResolvedValue(session);
    mocks.assignRole.mockRejectedValue(new PermissionDeniedError());
    const request = jsonRequest('http://localhost/api/admin/users/target-user/roles', {
      roleCode: 'OPS_MANAGER', companyId: 'company-1', reason: 'Attempted unauthorized role assignment',
    });
    const response = await POST(request, context);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Access denied.' });
  });

  it('rejects extra actor or target fields so callers cannot spoof assignment identity', async () => {
    mocks.getSession.mockResolvedValue(session);
    const request = jsonRequest('http://localhost/api/admin/users/target-user/roles', {
      roleCode: 'DRIVER', companyId: 'company-1', reason: 'Approved company driver assignment',
      actorId: 'spoofed', targetUserId: 'spoofed',
    });
    const response = await POST(request, context);
    expect(response.status).toBe(400);
    expect(mocks.assignRole).not.toHaveBeenCalled();
  });

  it('revokes assignments using the authenticated actor, assignment URL and required reason', async () => {
    mocks.getSession.mockResolvedValue(session);
    const assignment = { id: 'assignment-1', revokedAt: new Date() };
    mocks.revokeRoleAssignment.mockResolvedValue(assignment);
    const request = new Request('http://localhost/api/admin/role-assignments/assignment-1', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Remove outdated company driver role' }),
    });
    const response = await DELETE(request, assignmentContext);
    expect(response.status).toBe(200);
    expect(mocks.revokeRoleAssignment).toHaveBeenCalledWith({
      actorId: 'actor-admin', assignmentId: 'assignment-1', reason: 'Remove outdated company driver role',
    });
  });
});
