import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../interfaces/authenticated-user.interface';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves which company a request should be scoped to. A company-scoped
 * caller is always pinned to their own company — a query override can never
 * escalate them into another tenant. A platform admin/support caller (no
 * companyId on their own account) has no "own" company to default to, so
 * they must name one explicitly via ?companyId=<uuid> — this is how an
 * admin acts on behalf of one company at a time.
 *
 * Extracted from the decorator below so it's unit-testable without spinning
 * up an HTTP request.
 */
export function resolveCompanyId(
  user: AuthenticatedUser | undefined,
  requestedCompanyId: unknown,
): string {
  if (!user) {
    throw new ForbiddenException({
      code: 'COMPANY_CONTEXT_REQUIRED',
      message: 'This action requires a company context.',
      field: null,
    });
  }

  if (!isPlatformAdmin(user)) {
    return user.companyId as string;
  }

  if (requestedCompanyId === undefined) {
    throw new BadRequestException({
      code: 'COMPANY_ID_QUERY_PARAM_REQUIRED',
      message:
        'Platform admin/support callers must specify which company to act on via ?companyId=<uuid>.',
      field: 'companyId',
    });
  }
  if (
    typeof requestedCompanyId !== 'string' ||
    !UUID_PATTERN.test(requestedCompanyId)
  ) {
    throw new BadRequestException({
      code: 'INVALID_COMPANY_ID',
      message: '?companyId= must be a valid UUID.',
      field: 'companyId',
    });
  }
  return requestedCompanyId;
}

export const CurrentCompanyId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      query?: Record<string, unknown>;
    }>();
    return resolveCompanyId(request.user, request.query?.companyId);
  },
);
