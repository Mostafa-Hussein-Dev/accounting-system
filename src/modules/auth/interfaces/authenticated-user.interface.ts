export interface AuthenticatedUser {
  userId: string;
  // The ACTIVE company for this token — the one company (of possibly several)
  // the user is currently acting in. null for a platform admin, or for a
  // multi-company user who has not selected one yet.
  companyId: string | null;
  isPlatformAdmin: boolean;
  // True while the user must change a temp password (PasswordChangeGuard gate).
  mustChangePassword: boolean;
}

export interface AuthenticatedRefreshToken {
  userId: string;
  tokenId: string;
  // Carried through refresh so the re-issued token keeps the same active
  // company / admin context.
  companyId: string | null;
  isPlatformAdmin: boolean;
}

/** A platform/support account (no company membership; sees across tenants). */
export function isPlatformAdmin(user: AuthenticatedUser): boolean {
  return user.isPlatformAdmin;
}
