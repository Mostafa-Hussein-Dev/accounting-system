import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { AuditAction } from '@prisma/client';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditService } from './audit.service';
import { AUDIT_META, NO_AUDIT, type AuditMeta } from './audit.constants';

const METHOD_ACTION: Record<string, AuditAction> = {
  POST: AuditAction.CREATE,
  PUT: AuditAction.UPDATE,
  PATCH: AuditAction.UPDATE,
  DELETE: AuditAction.DELETE,
};

/**
 * Automatically records every authenticated mutating request (POST/PUT/PATCH/
 * DELETE) to the audit trail (FR-1102). This is the COARSE path: actor, action,
 * entity, id, after-state (the handler's result), IP, and status — `before` is
 * null here. Richer before/after entries for financial domain events are
 * emitted explicitly by services via AuditService (those routes carry
 * @NoAudit so they aren't double-logged).
 *
 * Writes are best-effort and never block or fail the request (AuditService
 * swallows write errors when called without a transaction).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const skip = this.reflector.getAllAndOverride<boolean | undefined>(
      NO_AUDIT,
      [context.getHandler(), context.getClass()],
    );
    const action = METHOD_ACTION[request.method];
    const user = request.user;

    // Only audit mutating verbs performed by an authenticated actor. Public
    // routes (login/register/refresh/reset) carry no request.user; login is
    // recorded explicitly by AuthService instead.
    if (skip || !action || !user?.userId) {
      return next.handle();
    }

    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(
      AUDIT_META,
      [context.getHandler(), context.getClass()],
    );
    const entity =
      meta?.entity ?? context.getClass().name.replace(/Controller$/, '');
    const paramId = (request.params as Record<string, string> | undefined)?.id;
    const ip = request.ip ?? null;
    const path = request.originalUrl ?? request.url ?? null;

    return next.handle().pipe(
      tap((result: unknown) => {
        const response = context.switchToHttp().getResponse<Response>();
        const after = unwrapEnvelope(result);
        // Fire-and-forget: auditing must never block or fail the request.
        // AuditService already swallows write errors; the extra .catch is
        // defence in depth against any unexpected rejection.
        void this.audit
          .record({
            action: meta?.action ?? action,
            entity,
            entityId: paramId ?? extractId(after) ?? null,
            companyId: user.companyId,
            userId: user.userId,
            after,
            ip,
            method: request.method,
            path,
            statusCode: response.statusCode,
          })
          .catch(() => undefined);
      }),
    );
  }
}

/**
 * The handler result may already be wrapped by ResponseInterceptor as
 * `{ data, meta }` depending on interceptor ordering. Record the underlying
 * entity either way so `after` is the resource, not the envelope.
 */
function unwrapEnvelope(result: unknown): unknown {
  if (
    result &&
    typeof result === 'object' &&
    'data' in result &&
    'meta' in result &&
    Object.keys(result).length === 2
  ) {
    return (result as { data: unknown }).data;
  }
  return result;
}

function extractId(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'id' in value) {
    const id = value.id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}
