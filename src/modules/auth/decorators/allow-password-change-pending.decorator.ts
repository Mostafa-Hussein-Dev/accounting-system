import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_PENDING = 'allow_password_change_pending';

/**
 * Marks a route as reachable even while the caller still must change a temp
 * password (change-password, me, logout). Every other authenticated route is
 * blocked by PasswordChangeGuard until the password is changed.
 */
export const AllowPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING, true);
