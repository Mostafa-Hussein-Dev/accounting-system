import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditAction } from '@prisma/client';
import { of, lastValueFrom } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService, type AuditRecordInput } from './audit.service';
import { AUDIT_META, NO_AUDIT } from './audit.constants';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: Reflector;
  let recorded: AuditRecordInput[];
  let audit: Pick<AuditService, 'record'>;

  const makeContext = (
    method: string,
    opts: {
      user?: { userId: string; companyId: string | null } | undefined;
      params?: Record<string, string>;
      className?: string;
    } = {},
  ): ExecutionContext => {
    const request = {
      method,
      user: opts.user,
      params: opts.params ?? {},
      ip: '10.0.0.1',
      originalUrl: '/api/v1/accounts',
      url: '/api/v1/accounts',
    };
    const response = { statusCode: method === 'DELETE' ? 204 : 200 };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: () => () => undefined,
      getClass: () => ({ name: opts.className ?? 'AccountsController' }),
    } as unknown as ExecutionContext;
  };

  const handlerOf = (value: unknown): CallHandler => ({
    handle: () => of(value),
  });

  const run = async (ctx: ExecutionContext, value: unknown): Promise<void> => {
    await lastValueFrom(interceptor.intercept(ctx, handlerOf(value)));
    // record() is fired without await inside tap; flush the microtask queue.
    await Promise.resolve();
  };

  beforeEach(() => {
    reflector = new Reflector();
    recorded = [];
    audit = {
      record: jest.fn((input: AuditRecordInput) => {
        recorded.push(input);
        return Promise.resolve();
      }),
    };
    interceptor = new AuditInterceptor(reflector, audit as AuditService);
  });

  it('records a CREATE for an authenticated POST, deriving entity from the controller and id from the result', async () => {
    const ctx = makeContext('POST', {
      user: { userId: 'u1', companyId: 'c1' },
    });
    await run(ctx, { id: 'acc-1', name: 'Cash' });

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      action: AuditAction.CREATE,
      entity: 'Accounts',
      entityId: 'acc-1',
      companyId: 'c1',
      userId: 'u1',
      statusCode: 200,
      ip: '10.0.0.1',
    });
  });

  it('prefers a route param id over the result id', async () => {
    const ctx = makeContext('PATCH', {
      user: { userId: 'u1', companyId: 'c1' },
      params: { id: 'param-id' },
    });
    await run(ctx, { id: 'body-id' });

    expect(recorded[0].action).toBe(AuditAction.UPDATE);
    expect(recorded[0].entityId).toBe('param-id');
  });

  it('unwraps a { data, meta } envelope so `after` is the entity', async () => {
    const ctx = makeContext('POST', {
      user: { userId: 'u1', companyId: 'c1' },
    });
    await run(ctx, { data: { id: 'x', name: 'n' }, meta: null });

    expect(recorded[0].after).toEqual({ id: 'x', name: 'n' });
    expect(recorded[0].entityId).toBe('x');
  });

  it('skips non-mutating verbs (GET)', async () => {
    const ctx = makeContext('GET', {
      user: { userId: 'u1', companyId: 'c1' },
    });
    await run(ctx, [{ id: 'a' }]);
    expect(recorded).toHaveLength(0);
  });

  it('skips when there is no authenticated user (public route)', async () => {
    const ctx = makeContext('POST', { user: undefined });
    await run(ctx, { id: 'a' });
    expect(recorded).toHaveLength(0);
  });

  it('skips a route marked @NoAudit', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) =>
        key === NO_AUDIT ? true : undefined,
      );
    const ctx = makeContext('POST', {
      user: { userId: 'u1', companyId: 'c1' },
    });
    await run(ctx, { id: 'a' });
    expect(recorded).toHaveLength(0);
  });

  it('honours @Audit metadata overriding action and entity', async () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) =>
        key === AUDIT_META
          ? { action: AuditAction.POST, entity: 'JournalEntry' }
          : undefined,
      );
    const ctx = makeContext('POST', {
      user: { userId: 'u1', companyId: 'c1' },
      params: { id: 'je-1' },
    });
    await run(ctx, { id: 'je-1' });

    expect(recorded[0]).toMatchObject({
      action: AuditAction.POST,
      entity: 'JournalEntry',
      entityId: 'je-1',
    });
  });

  it('never throws or blocks the request when the audit write rejects', async () => {
    (audit.record as jest.Mock).mockRejectedValue(new Error('db down'));
    const ctx = makeContext('DELETE', {
      user: { userId: 'u1', companyId: 'c1' },
      params: { id: 'x' },
    });
    // Should resolve, not reject.
    await expect(run(ctx, undefined)).resolves.toBeUndefined();
  });
});
