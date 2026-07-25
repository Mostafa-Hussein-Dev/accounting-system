import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CompanyMembershipGuard } from './company-membership.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

const COMPANY_ID = 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab';

function contextWith(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(isMember: boolean): {
  guard: CompanyMembershipGuard;
  findFirst: jest.Mock;
} {
  const findFirst = jest
    .fn()
    .mockResolvedValue(isMember ? { userId: 'u1' } : null);
  const prisma = {
    userCompany: { findFirst },
  } as unknown as PrismaService;
  return { guard: new CompanyMembershipGuard(prisma), findFirst };
}

describe('CompanyMembershipGuard', () => {
  it('passes a platform admin without touching the database', async () => {
    const { guard, findFirst } = guardWith(false);
    const ctx = contextWith({
      userId: 'admin',
      companyId: null,
      isPlatformAdmin: true,
      mustChangePassword: false,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('passes a company user who is an active member of their active company', async () => {
    const { guard } = guardWith(true);
    const ctx = contextWith({
      userId: 'u1',
      companyId: COMPANY_ID,
      isPlatformAdmin: false,
      mustChangePassword: false,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects a company user whose membership was revoked', async () => {
    const { guard } = guardWith(false);
    const ctx = contextWith({
      userId: 'u1',
      companyId: COMPANY_ID,
      isPlatformAdmin: false,
      mustChangePassword: false,
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a company user with no active company selected', async () => {
    const { guard } = guardWith(true);
    const ctx = contextWith({
      userId: 'u1',
      companyId: null,
      isPlatformAdmin: false,
      mustChangePassword: false,
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user', async () => {
    const { guard } = guardWith(true);
    await expect(guard.canActivate(contextWith(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
