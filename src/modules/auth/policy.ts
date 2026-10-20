/** Deny sessions for anything other than an explicitly active account. */
export function mayStartSession(accountStatus: string | null | undefined): boolean {
  return accountStatus === 'ACTIVE';
}
