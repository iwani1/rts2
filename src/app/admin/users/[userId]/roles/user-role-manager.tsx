'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Role = { code: string; name: string };
type Assignment = {
  id: string;
  roleCode: string;
  reason: string;
  createdAt: string;
  revokedAt: string | null;
  role: { name: string };
  company: { name: string } | null;
  assignedBy: { name: string | null; email: string } | null;
};
type Directory = {
  user: { id: string; name: string; email: string; status: string };
  roles: Role[];
  assignments: Assignment[];
};

export function UserRoleManager({
  targetUserId,
  currentUserId,
  targetIsActive,
  targetIsSelf,
  company,
}: {
  targetUserId: string;
  currentUserId: string;
  targetIsActive: boolean;
  targetIsSelf: boolean;
  company: { id: string; name: string } | null;
}) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [roleCode, setRoleCode] = useState('');
  const [assignReason, setAssignReason] = useState('');
  const [revokeReasons, setRevokeReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadDirectory = useCallback(async () => {
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/roles`, { cache: 'no-store' });
      const body = await response.json() as Directory & { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to load role assignments.');
      setDirectory(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load role assignments.');
    } finally {
      setPending(false);
    }
  }, [targetUserId]);

  useEffect(() => { void loadDirectory(); }, [loadDirectory]);

  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleCode || assignReason.trim().length < 8) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const body = {
        roleCode,
        ...(roleCode === 'SUPER_ADMIN' ? {} : company ? { companyId: company.id } : {}),
        reason: assignReason,
      };
      const response = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/roles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to assign this role.');
      setRoleCode('');
      setAssignReason('');
      setNotice('Role assigned and recorded in audit history.');
      await loadDirectory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to assign this role.');
      setPending(false);
    }
  }

  async function revokeRole(assignment: Assignment) {
    const reason = revokeReasons[assignment.id]?.trim() ?? '';
    if (reason.length < 8) {
      setError('Enter a revocation reason of at least eight characters.');
      return;
    }
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/role-assignments/${encodeURIComponent(assignment.id)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to revoke this role.');
      setNotice('Role revoked and recorded in audit history.');
      setRevokeReasons((current) => ({ ...current, [assignment.id]: '' }));
      await loadDirectory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to revoke this role.');
      setPending(false);
    }
  }

  const activeAssignments = directory?.assignments.filter((assignment) => !assignment.revokedAt) ?? [];
  const history = directory?.assignments.filter((assignment) => Boolean(assignment.revokedAt)) ?? [];

  return <div className="user-role-manager">
    <section className="vehicle-editor" aria-labelledby="assign-role-title">
      <div className="vehicle-editor-heading"><div><p className="eyebrow">Approved role catalogue</p><h2 id="assign-role-title">Assign a role</h2></div></div>
      {!targetIsActive && <p className="form-help">Only active accounts can receive role assignments.</p>}
      {targetIsSelf && <p className="form-help">You cannot change your own roles. Use another active Super Administrator to review this account.</p>}
      {!company && <p className="form-help">Company-scoped roles are unavailable until exactly one active operator company exists. A Super Administrator role, if selected, is global and never assigned to a company.</p>}
      <form className="user-role-form" onSubmit={assignRole}>
        <label>Role<select value={roleCode} onChange={(event) => setRoleCode(event.target.value)} required disabled={pending || !targetIsActive || targetIsSelf}>
          <option value="">Choose a role</option>
          {(directory?.roles ?? []).map((role) => <option key={role.code} value={role.code}>{role.name}{role.code === 'SUPER_ADMIN' ? ' — global' : ' — company-scoped'}</option>)}
        </select></label>
        {company && roleCode !== 'SUPER_ADMIN' && <p className="form-help">Company: {company.name}. Role scope comes from the approved permission matrix; it is not editable here.</p>}
        <label>Reason for assignment<textarea value={assignReason} onChange={(event) => setAssignReason(event.target.value)} minLength={8} maxLength={500} required disabled={pending || !targetIsActive || targetIsSelf} /></label>
        <p className="form-help">Assignments and reasons are recorded in the append-only audit history. Keep reasons factual; do not include passwords or unnecessary personal details. This screen does not create, activate, or suspend user accounts.</p>
        <button className="button-primary" type="submit" disabled={pending || !targetIsActive || targetIsSelf || !roleCode || assignReason.trim().length < 8 || (roleCode !== 'SUPER_ADMIN' && !company)}>{pending ? 'Saving…' : 'Assign role'}</button>
      </form>
    </section>

    <section className="fleet-list-panel" aria-labelledby="active-roles-title">
      <div className="fleet-list-heading"><div><h2 id="active-roles-title">Active role assignments</h2><p className="muted">Revoking access is immediate. Super Administrator protections are enforced by the server.</p></div></div>
      {pending && !directory ? <p role="status">Loading role assignments…</p> : !directory ? <button className="button-link" type="button" onClick={() => void loadDirectory()}>Try again</button> : activeAssignments.length === 0 ? <div className="fleet-empty"><h3>No active role assignments</h3><p>Assign an approved role above if access is required.</p></div> : <div className="vehicle-table-wrap" role="region" aria-label="Active role assignments" tabIndex={0}>
        <table className="vehicle-table"><caption className="sr-only">Active role assignments for this user</caption>
          <thead><tr><th scope="col">Role</th><th scope="col">Company scope</th><th scope="col">Assigned</th><th scope="col">Assigned by</th><th scope="col">Reason</th><th scope="col">Revoke access</th></tr></thead>
          <tbody>{activeAssignments.map((assignment) => {
            const ownAccount = targetUserId === currentUserId;
            return <tr key={assignment.id}>
              <td>{assignment.role.name}</td><td>{assignment.company?.name ?? 'Global'}</td>
              <td><time dateTime={assignment.createdAt}>{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeZone: 'Africa/Accra' }).format(new Date(assignment.createdAt))}</time></td>
              <td>{assignment.assignedBy?.name || assignment.assignedBy?.email || 'Not recorded'}</td><td>{assignment.reason}</td>
              <td>{ownAccount ? <span className="form-help">You cannot revoke your own access.</span> : <div className="role-revoke-controls">
                <label className="sr-only" htmlFor={`revoke-${assignment.id}`}>Reason to revoke {assignment.role.name}</label>
                <input id={`revoke-${assignment.id}`} value={revokeReasons[assignment.id] ?? ''} onChange={(event) => setRevokeReasons((current) => ({ ...current, [assignment.id]: event.target.value }))} minLength={8} maxLength={500} placeholder="Revocation reason" disabled={pending} />
                <button className="button-danger" type="button" disabled={pending || (revokeReasons[assignment.id]?.trim().length ?? 0) < 8} onClick={() => void revokeRole(assignment)}>Revoke</button>
              </div>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>

    {history.length > 0 && <section className="fleet-list-panel" aria-labelledby="role-history-title">
      <h2 id="role-history-title">Revoked role history</h2>
      <div className="vehicle-table-wrap" role="region" aria-label="Revoked role history" tabIndex={0}>
        <table className="vehicle-table"><caption className="sr-only">Previously revoked role assignments</caption>
          <thead><tr><th scope="col">Role</th><th scope="col">Company scope</th><th scope="col">Assigned</th><th scope="col">Revoked</th><th scope="col">Reason</th></tr></thead>
          <tbody>{history.map((assignment) => <tr key={assignment.id}><td>{assignment.role.name}</td><td>{assignment.company?.name ?? 'Global'}</td><td>{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeZone: 'Africa/Accra' }).format(new Date(assignment.createdAt))}</td><td>{new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeZone: 'Africa/Accra' }).format(new Date(assignment.revokedAt!))}</td><td>{assignment.reason}</td></tr>)}</tbody>
        </table>
      </div>
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status">{notice}</p>}
  </div>;
}
