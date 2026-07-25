import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../../auth/interfaces/authenticated-user.interface';

/**
 * Allows a platform admin to act on any company, and a company user to act on
 * any company they are a member of (matched against the :id route param) —
 * not just their currently-active one, so an owner can read/manage any of
 * their companies. Must run after JwtAuthGuard.
 */
@Injectable()
export class CompanySelfOrAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
    if (isPlatformAdmin(user)) {
      return true;
    }
    const membership = await this.prisma.userCompany.findFirst({
      where: { userId: user.userId, companyId: request.params.id },
      select: { userId: true },
    });
    if (membership) {
      return true;
    }
    throw new ForbiddenException({
      code: 'COMPANY_ACCESS_DENIED',
      message: 'You do not have access to this company.',
      field: null,
    });
  }
}
