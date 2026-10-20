// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRoleManager } from './user-role-manager';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => vi.clearAllMocks());

const directory = {
  user: { id: 'user-2', name: 'Ama Driver', email: 'ama@example.invalid', status: 'ACTIVE' },
  roles: [{ code: 'DRIVER', name: 'Driver' }, { code: 'SUPER_ADMIN', name: 'Super Administrator' }],
  assignments: [],
};

describe('UserRoleManager', () => {
  it('loads the catalogue, assigns a company role with a reason, and refreshes audit-backed history', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(directory), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assignment: { id: 'assignment-1' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...directory,
        assignments: [{
          id: 'assignment-1', roleCode: 'DRIVER', reason: 'Approved driver account access',
          createdAt: '2026-10-19T10:00:00.000Z', revokedAt: null,
          role: { name: 'Driver' }, company: { name: 'Richie Transport Services' },
          assignedBy: { name: 'System Admin', email: 'admin@example.invalid' },
        }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<UserRoleManager targetUserId="user-2" currentUserId="admin-1" targetIsActive targetIsSelf={false} company={{ id: 'company-1', name: 'Richie Transport Services' }} />);

    await user.selectOptions(await screen.findByLabelText('Role'), 'DRIVER');
    await user.type(screen.getByLabelText('Reason for assignment'), 'Approved driver account access');
    await user.click(screen.getByRole('button', { name: 'Assign role' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/api/admin/users/user-2/roles');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      roleCode: 'DRIVER', companyId: 'company-1', reason: 'Approved driver account access',
    });
    expect(await screen.findByText('Role assigned and recorded in audit history.')).toBeTruthy();
    expect(await screen.findByText('Richie Transport Services')).toBeTruthy();
  });

  it('requires a revocation reason and refreshes assignment history after revoke', async () => {
    const user = userEvent.setup();
    const assignment = {
      id: 'assignment-1', roleCode: 'DRIVER', reason: 'Approved driver account access',
      createdAt: '2026-10-19T10:00:00.000Z', revokedAt: null,
      role: { name: 'Driver' }, company: { name: 'Richie Transport Services' },
      assignedBy: { name: 'System Admin', email: 'admin@example.invalid' },
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...directory, assignments: [assignment] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assignment: { ...assignment, revokedAt: '2026-10-19T11:00:00.000Z' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...directory, assignments: [{ ...assignment, revokedAt: '2026-10-19T11:00:00.000Z' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<UserRoleManager targetUserId="user-2" currentUserId="admin-1" targetIsActive targetIsSelf={false} company={{ id: 'company-1', name: 'Richie Transport Services' }} />);
    const revokeButton = await screen.findByRole('button', { name: 'Revoke' });
    expect((revokeButton as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Reason to revoke Driver'), 'Remove no-longer-needed role');
    await user.click(revokeButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ reason: 'Remove no-longer-needed role' });
    expect(await screen.findByText('Role revoked and recorded in audit history.')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Revoked role history' })).toBeTruthy();
  });

  it('does not expose an enabled assignment action for the current account', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      ...directory,
      user: { ...directory.user, id: 'admin-1' },
    }), { status: 200 })));
    render(<UserRoleManager targetUserId="admin-1" currentUserId="admin-1" targetIsActive targetIsSelf company={{ id: 'company-1', name: 'Richie Transport Services' }} />);
    expect(await screen.findByText(/You cannot change your own roles/)).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Assign role' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
