import { AuditAction } from '@prisma/client';

/** Reflector metadata keys read by the AuditInterceptor. */
export const AUDIT_META = 'audit:meta';
export const NO_AUDIT = 'audit:skip';

/**
 * Overrides the interceptor's route-derived defaults for one handler.
 * `entity`/`action` let a domain route record a meaningful name and a domain
 * verb (e.g. POST /journal-entries/:id/post → action POST, entity JournalEntry)
 * instead of the generic CREATE/Controller-name derivation.
 */
export interface AuditMeta {
  action?: AuditAction;
  entity?: string;
}

/** Fields stripped from any captured body/state before it is persisted. */
export const REDACTED_FIELDS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'token',
  'code',
  'codeHash',
  'tempPassword',
]);
