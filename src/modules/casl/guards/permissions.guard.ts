import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from '../casl-ability.factory';
import {
  REQUIRE_PERMISSIONS_KEY,
  type RequiredPermission,
} from '../decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<
      RequiredPermission[] | undefined
    >(REQUIRE_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Authentication is required for this action.',
        field: null,
      });
    }

    const ability = await this.caslAbilityFactory.createForUser(request.user);
    const allowed = required.every(({ action, subject }) =>
      ability.can(action, subject),
    );

    if (!allowed) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'You do not have permission to perform this action.',
        field: null,
      });
    }

    return true;
  }
}
