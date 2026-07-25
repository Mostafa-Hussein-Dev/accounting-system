import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CompanySelfOrAdminGuard } from './company-self-or-admin.guard';
import { PrismaService } from '../../../prisma/prisma.service';
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

// A membership row exists only for (u1, COMPANY_ID).
function guardWith(isMember: boolean): CompanySelfOrAdminGuard {
  const prisma = {
    userCompany: {
      findFirst: jest
        .fn()
        .mockResolvedValue(isMember ? { userId: 'u1' } : null),
    },
  } as unknown as PrismaService;
  return new CompanySelfOrAdminGuard(prisma);
}

describe('CompanySelfOrAdminGuard', () => {
  it('allows a platform admin to act on any company (no DB lookup)', async () => {
    const guard = guardWith(false);
    const context = contextFor(
      { userId: 'admin', companyId: null, isPlatformAdmin: true, mustChangePassword: false },
      COMPANY_ID,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows a company user to act on a company they are a member of', async () => {
    const guard = guardWith(true);
    const context = contextFor(
      { userId: 'u1', companyId: COMPANY_ID, isPlatformAdmin: false, mustChangePassword: false },
      COMPANY_ID,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a company user acting on a company they do not belong to', async () => {
    const guard = guardWith(false);
    const context = contextFor(
      { userId: 'u1', companyId: COMPANY_ID, isPlatformAdmin: false, mustChangePassword: false },
      OTHER_COMPANY_ID,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when there is no authenticated user at all', async () => {
    const guard = guardWith(true);
    const context = contextFor(undefined, COMPANY_ID);
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
