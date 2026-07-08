export interface AuthenticatedUser {
  userId: string;
  companyId: string | null;
}

export interface AuthenticatedRefreshToken {
  userId: string;
  tokenId: string;
}

/**
 * Interim signal only: until real roles/permissions exist (CASL), a user
 * with no companyId is the only way this system can express "platform
 * admin/support." Replace this check with a real role check once roles
 * land — this is the single place that needs to change.
 */
export function isPlatformAdmin(user: AuthenticatedUser): boolean {
  return user.companyId === null;
}
