import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../../auth/interfaces/authenticated-user.interface';

/**
 * Allows a platform admin to act on any company, and a company-scoped
 * caller to act only on their own company (matched against the :id route
 * param). Must run after JwtAuthGuard.
 */
@Injectable()
export class CompanySelfOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser; params: { id: string } }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException({
        code: 'COMPANY_CONTEXT_REQUIRED',
        message: 'This action requires a company context.',
        field: null,
      });
    }
    if (isPlatformAdmin(user) || user.companyId === request.params.id) {
      return true;
    }
    throw new ForbiddenException({
      code: 'COMPANY_ACCESS_DENIED',
      message: 'You do not have access to this company.',
      field: null,
    });
  }
}
