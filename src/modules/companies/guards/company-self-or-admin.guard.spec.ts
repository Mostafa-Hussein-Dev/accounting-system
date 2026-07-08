import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CompanySelfOrAdminGuard } from './company-self-or-admin.guard';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

const COMPANY_ID = 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab';
const OTHER_COMPANY_ID = 'c4a2d3f1-5678-4b6c-8d9e-2345678901bc';

function contextFor(
  user: AuthenticatedUser | undefined,
  companyIdParam: string,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params: { id: companyIdParam } }),
    }),
  } as unknown as ExecutionContext;
}

describe('CompanySelfOrAdminGuard', () => {
  const guard = new CompanySelfOrAdminGuard();

  it('allows a platform admin to act on any company', () => {
    const context = contextFor(
      { userId: 'admin', companyId: null },
      COMPANY_ID,
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a company-scoped caller to act on their own company', () => {
    const context = contextFor(
      { userId: 'u1', companyId: COMPANY_ID },
      COMPANY_ID,
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a company-scoped caller acting on a different company', () => {
    const context = contextFor(
      { userId: 'u1', companyId: COMPANY_ID },
      OTHER_COMPANY_ID,
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user at all', () => {
    const context = contextFor(undefined, COMPANY_ID);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
