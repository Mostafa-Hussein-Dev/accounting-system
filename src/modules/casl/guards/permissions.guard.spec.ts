import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createMongoAbility } from '@casl/ability';
import { PermissionsGuard } from './permissions.guard';
import { CaslAbilityFactory } from '../casl-ability.factory';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { RequiredPermission } from '../decorators/require-permissions.decorator';

function contextWithUser(
  user: AuthenticatedUser | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const user: AuthenticatedUser = {
    userId: 'u1',
    companyId: 'c1',
    isPlatformAdmin: false, mustChangePassword: false,
  };

  function makeGuard(
    required: RequiredPermission[] | undefined,
    allowed: boolean,
  ) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    const factory = {
      createForUser: jest
        .fn()
        .mockResolvedValue(
          createMongoAbility(
            allowed ? [{ action: 'read', subject: 'Company' }] : [],
          ),
        ),
    } as unknown as CaslAbilityFactory;
    return new PermissionsGuard(reflector, factory);
  }

  it('allows the request through when no permissions are required', async () => {
    const guard = makeGuard(undefined, false);
    await expect(guard.canActivate(contextWithUser(user))).resolves.toBe(true);
  });

  it('allows the request when the built ability grants the required permission', async () => {
    const guard = makeGuard([{ action: 'read', subject: 'Company' }], true);
    await expect(guard.canActivate(contextWithUser(user))).resolves.toBe(true);
  });

  it('rejects the request when the ability does not grant the required permission', async () => {
    const guard = makeGuard([{ action: 'read', subject: 'Company' }], false);
    await expect(guard.canActivate(contextWithUser(user))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when there is no authenticated user at all', async () => {
    const guard = makeGuard([{ action: 'read', subject: 'Company' }], true);
    await expect(guard.canActivate(contextWithUser(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
