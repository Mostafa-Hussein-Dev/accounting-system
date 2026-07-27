import { SetMetadata } from '@nestjs/common';
import { AUDIT_META, NO_AUDIT, type AuditMeta } from '../audit.constants';

/**
 * Override the AuditInterceptor's route-derived entity/action for this handler.
 * Use on domain routes whose meaning isn't captured by the HTTP verb alone
 * (e.g. `@Audit({ action: 'POST', entity: 'JournalEntry' })`).
 */
export const Audit = (meta: AuditMeta): MethodDecorator =>
  SetMetadata(AUDIT_META, meta);

/**
 * Opt a mutating route out of automatic audit logging — used where an explicit
 * AuditService call already records a richer entry (login, post, reverse), or
 * for routes that would only add noise.
 */
export const NoAudit = (): MethodDecorator => SetMetadata(NO_AUDIT, true);
