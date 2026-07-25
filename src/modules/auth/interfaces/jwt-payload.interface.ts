export interface JwtPayload {
  sub: string;
  // The active company baked into this token (verified at login/switch), or
  // null for a platform admin / not-yet-selected multi-company user.
  companyId: string | null;
  isPlatformAdmin: boolean;
  // True while the user must change a temp password before using the account;
  // PasswordChangeGuard blocks every route except change-password.
  mustChangePassword: boolean;
}

export interface JwtRefreshPayload extends JwtPayload {
  jti: string;
}
