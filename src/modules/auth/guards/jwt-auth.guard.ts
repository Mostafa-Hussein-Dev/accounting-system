import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_PASSWORD_CHANGE_PENDING } from '../decorators/allow-password-change-pending.decorator';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Standard JWT access-token guard, plus the must-change-password gate. Because
 * this guard runs on every authenticated route (and is what populates
 * request.user), it is the single place to enforce that a user with a temp
 * password can reach nothing except the routes marked
 * @AllowPasswordChangePending (change-password / me / logout) until they change
 * it — a caller otherwise gets 403 PASSWORD_CHANGE_REQUIRED.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Run the JWT authentication first (populates request.user), then apply the
    // password-change gate.
    const authed = (await super.canActivate(context)) as boolean;
    if (!authed) {
      return false;
    }

    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_PASSWORD_CHANGE_PENDING,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (request.user?.mustChangePassword) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message:
          'You must change your temporary password before performing this action.',
        field: null,
      });
    }
    return true;
  }
}
