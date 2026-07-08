import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

function contextWithUser(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('allows a platform admin caller (companyId null) through', () => {
    const context = contextWithUser({ userId: 'admin', companyId: null });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a company-scoped caller', () => {
    const context = contextWithUser({
      userId: 'u1',
      companyId: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user at all', () => {
    const context = contextWithUser(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
