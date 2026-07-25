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
} from '../interfaces/authenticated-user.interface';

/**
 * Verifies, on every request, that a company-scoped caller is still an active
 * member of the company their token is scoped to. Token-issue-time checks
 * (login/switch) alone would trust a token for its whole lifetime; this closes
 * the gap when a membership is revoked, or the company is deactivated/deleted,
 * after the token was minted. Platform admins bypass it (they target a company
 * explicitly via ?companyId and PlatformAdminGuard where required).
 *
 * Must run after JwtAuthGuard. Compose on company-scoped controllers:
 *   @UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
 */
@Injectable()
export class CompanyMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
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
    if (!user.companyId) {
      throw new ForbiddenException({
        code: 'COMPANY_CONTEXT_REQUIRED',
        message:
          'No active company selected. Use POST /auth/switch-company to choose one.',
        field: null,
      });
    }

    const membership = await this.prisma.userCompany.findFirst({
      where: {
        userId: user.userId,
        companyId: user.companyId,
        company: { deletedAt: null, isActive: true },
      },
      select: { userId: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'COMPANY_MEMBERSHIP_REQUIRED',
        message: 'You are no longer a member of the active company.',
        field: null,
      });
    }
    return true;
  }
}
