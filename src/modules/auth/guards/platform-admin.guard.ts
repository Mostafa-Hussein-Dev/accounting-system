import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../interfaces/authenticated-user.interface';

/**
 * Restricts a route to platform admin/support callers. Must run after
 * JwtAuthGuard (which populates request.user) — e.g.
 * @UseGuards(JwtAuthGuard, PlatformAdminGuard).
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (!request.user || !isPlatformAdmin(request.user)) {
      throw new ForbiddenException({
        code: 'PLATFORM_ADMIN_REQUIRED',
        message: 'This action is restricted to platform admin/support users.',
        field: null,
      });
    }
    return true;
  }
}
