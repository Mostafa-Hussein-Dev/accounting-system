import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CompaniesService } from '../companies/companies.service';
import { MailerService } from '../../common/mailer/mailer.service';
import { EnvConfig } from '../../config/env.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthCompanyDto, AuthResponseDto } from './dto/auth-response.dto';
import { MeResponseDto } from './dto/me-response.dto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import {
  JwtPayload,
  JwtRefreshPayload,
} from './interfaces/jwt-payload.interface';

const TOKEN_TYPE = 'Bearer';
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const BCRYPT_SALT_ROUNDS = 12;
const INVALID_CREDENTIALS_ERROR = {
  code: 'AUTH_INVALID_CREDENTIALS',
  message: 'Email or password is incorrect.',
  field: null,
};

// Password-reset security parameters — see PasswordResetToken's schema
// comment for how these three work together to make a low-entropy 6-digit
// code safe: short-lived, capped attempts, at most one live code per user.
const RESET_CODE_DIGITS = 6;
const RESET_CODE_TTL_MINUTES = 15;
const RESET_CODE_MAX_ATTEMPTS = 5;
// Matches the frontend's own client-side resend cooldown (ForgotPasswordPage
// § RESEND_COOLDOWN_SECONDS) — enforced here too since a client-side-only
// cooldown is trivially bypassed by calling the API directly.
const RESET_REQUEST_COOLDOWN_SECONDS = 30;
const INVALID_RESET_CODE_ERROR = {
  code: 'AUTH_INVALID_RESET_CODE',
  message: 'That code is invalid or has expired.',
  field: 'code',
};
const TOO_MANY_ATTEMPTS_ERROR = {
  code: 'AUTH_TOO_MANY_ATTEMPTS',
  message: 'Too many incorrect attempts. Request a new code.',
  field: null,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly companiesService: CompaniesService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly mailerService: MailerService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      // The user is created first (no company of their own now), then the
      // company is provisioned FOR them: membership + Company Admin role +
      // seeded chart/VAT/sequences — all in one transaction.
      const createdUser = await this.usersService.create(
        dto.user,
        undefined,
        tx,
      );
      const company = await this.companiesService.provision(
        dto.company,
        createdUser.id,
        tx,
      );
      return { userId: createdUser.id, companyId: company.id };
    });

    await this.usersService.touchLastLogin(result.userId);
    const companies = await this.resolveUserCompanies(result.userId);
    return this.issueTokenPair(
      result.userId,
      result.companyId,
      false,
      companies,
    );
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findAuthUserByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_ERROR);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_ERROR);
    }

    await this.usersService.touchLastLogin(user.id);
    const companies = user.isPlatformAdmin
      ? []
      : await this.resolveUserCompanies(user.id);
    const active = this.pickActiveCompany(user.isPlatformAdmin, companies);
    return this.issueTokenPair(
      user.id,
      active,
      user.isPlatformAdmin,
      companies,
      user.mustChangePassword,
    );
  }

  /**
   * Make one of the user's companies active and issue a token scoped to it.
   * Membership is verified here (token-issue time); a per-request guard
   * re-checks it in case the membership is revoked while a token is still live.
   */
  async switchCompany(
    userId: string,
    companyId: string,
  ): Promise<AuthResponseDto> {
    const membership = await this.prisma.userCompany.findFirst({
      where: {
        userId,
        companyId,
        company: { deletedAt: null, isActive: true },
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'COMPANY_MEMBERSHIP_REQUIRED',
        message: 'You are not a member of that company.',
        field: 'companyId',
      });
    }
    const companies = await this.resolveUserCompanies(userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mustChangePassword: true },
    });
    return this.issueTokenPair(
      userId,
      companyId,
      false,
      companies,
      user.mustChangePassword,
    );
  }

  async refresh(
    userId: string,
    tokenId: string,
    companyId: string | null,
    isPlatformAdmin: boolean,
  ): Promise<AuthResponseDto> {
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'AUTH_USER_INACTIVE',
        message: 'This account has been deactivated.',
        field: null,
      });
    }

    const companies = isPlatformAdmin
      ? []
      : await this.resolveUserCompanies(userId);
    // Keep the active company only if the user is still a member of it.
    const active =
      companyId && companies.some((c) => c.id === companyId) ? companyId : null;
    return this.issueTokenPair(
      userId,
      active,
      isPlatformAdmin,
      companies,
      user.mustChangePassword,
    );
  }

  /**
   * The current user + their company context (active company from the token,
   * plus every company they belong to). Looks the user up unscoped so it works
   * even before a multi-company user has selected an active company.
   */
  async me(caller: AuthenticatedUser): Promise<MeResponseDto> {
    const user = await this.usersService.findOne(caller.userId);
    const companies = caller.isPlatformAdmin
      ? []
      : await this.resolveUserCompanies(caller.userId);
    const dto = new MeResponseDto();
    Object.assign(dto, user);
    dto.activeCompanyId = caller.companyId;
    dto.companies = companies;
    dto.mustChangePassword = caller.mustChangePassword;
    return dto;
  }

  /**
   * Change the caller's own password. Verifies the current password, sets the
   * new one, clears mustChangePassword, and revokes every other session (like a
   * reset). Issues a fresh token pair so the caller keeps working with the flag
   * cleared. This is the only route a must-change-password user may call.
   */
  async changePassword(
    caller: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: caller.userId, deletedAt: null },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_ERROR);
    }
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CURRENT_PASSWORD',
        message: 'The current password is incorrect.',
        field: 'currentPassword',
      });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException({
        code: 'AUTH_PASSWORD_UNCHANGED',
        message: 'The new password must be different from the current one.',
        field: 'newPassword',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      }),
      // A password change ends every existing session (same as a reset).
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    const companies = caller.isPlatformAdmin
      ? []
      : await this.resolveUserCompanies(user.id);
    return this.issueTokenPair(
      user.id,
      caller.companyId,
      caller.isPlatformAdmin,
      companies,
      false,
    );
  }

  async logout(tokenId: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Always resolves the same way (no thrown error, no distinguishing return
   * value) regardless of whether the email belongs to a real, active
   * account — the caller/controller must not be able to use this endpoint
   * to enumerate registered emails. Every early return below is a silent
   * no-op for exactly that reason.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findAuthUserByEmail(dto.email);
    if (!user || !user.isActive) {
      return;
    }

    const mostRecent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const cooldownMs = RESET_REQUEST_COOLDOWN_SECONDS * MS_PER_SECOND;
    if (
      mostRecent &&
      Date.now() - mostRecent.createdAt.getTime() < cooldownMs
    ) {
      // The previous code is still fresh — it's still the one the user has
      // in their inbox, so there's nothing to send. Same generic outcome.
      return;
    }

    const code = randomInt(0, 10 ** RESET_CODE_DIGITS)
      .toString()
      .padStart(RESET_CODE_DIGITS, '0');
    const codeHash = await bcrypt.hash(code, BCRYPT_SALT_ROUNDS);
    const expiresAt = new Date(
      Date.now() + RESET_CODE_TTL_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND,
    );

    await this.prisma.$transaction([
      // At most one live code per user — issuing a new one immediately
      // kills any earlier unconsumed code (e.g. from a "resend").
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, codeHash, expiresAt },
      }),
    ]);

    try {
      await this.mailerService.sendPasswordResetCode({
        to: user.email,
        firstName: user.firstName,
        code,
        expiresInMinutes: RESET_CODE_TTL_MINUTES,
      });
    } catch (error) {
      // Never let an email-delivery failure change this endpoint's response
      // — that alone would leak that the account exists. Log for ops and
      // move on; the user can always ask for another code.
      this.logger.error(
        `Failed to send password reset email to ${user.email}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Validates a code against the user's live reset token without consuming
   * it — lets the frontend show a "code accepted" password step before the
   * user has actually chosen a new password. resetPassword() below re-checks
   * the code itself and is what actually spends it, so this step alone can
   * never complete a reset.
   */
  async verifyResetCode(dto: VerifyResetCodeDto): Promise<void> {
    const user = await this.findActiveUserOrThrowInvalidCode(dto.email);
    const token = await this.getLiveResetTokenOrThrow(user.id);

    // bcrypt.compare is constant-time with respect to its inputs, so this
    // doesn't leak which digit of the code was wrong via timing.
    const codeMatches = await bcrypt.compare(dto.code, token.codeHash);
    if (!codeMatches) {
      await this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new HttpException(INVALID_RESET_CODE_ERROR, HttpStatus.BAD_REQUEST);
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.findActiveUserOrThrowInvalidCode(dto.email);
    const token = await this.getLiveResetTokenOrThrow(user.id);

    const codeMatches = await bcrypt.compare(dto.code, token.codeHash);
    if (!codeMatches) {
      await this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new HttpException(INVALID_RESET_CODE_ERROR, HttpStatus.BAD_REQUEST);
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      // A password reset invalidates every existing session, not just
      // future logins — if the account was compromised, this is what
      // actually kicks the attacker out.
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // Same error as a wrong code — don't let this step confirm the email
  // exists either.
  private async findActiveUserOrThrowInvalidCode(email: string) {
    const user = await this.usersService.findAuthUserByEmail(email);
    if (!user || !user.isActive) {
      throw new HttpException(INVALID_RESET_CODE_ERROR, HttpStatus.BAD_REQUEST);
    }
    return user;
  }

  private async getLiveResetTokenOrThrow(userId: string) {
    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!token) {
      throw new HttpException(INVALID_RESET_CODE_ERROR, HttpStatus.BAD_REQUEST);
    }
    if (token.attempts >= RESET_CODE_MAX_ATTEMPTS) {
      throw new HttpException(
        TOO_MANY_ATTEMPTS_ERROR,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return token;
  }

  /** The companies a user belongs to (active, non-deleted), for the auth response. */
  private async resolveUserCompanies(
    userId: string,
  ): Promise<AuthCompanyDto[]> {
    const memberships = await this.prisma.userCompany.findMany({
      where: { userId, company: { deletedAt: null, isActive: true } },
      select: { company: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.company.id,
      name: m.company.name,
    }));
  }

  /**
   * Which company a freshly issued token is scoped to: none for a platform
   * admin; the sole company for a single-company user (auto-selected); none for
   * a multi-company user, who must choose via POST /auth/switch-company.
   */
  private pickActiveCompany(
    isPlatformAdmin: boolean,
    companies: AuthCompanyDto[],
  ): string | null {
    if (isPlatformAdmin) {
      return null;
    }
    return companies.length === 1 ? companies[0].id : null;
  }

  private async issueTokenPair(
    userId: string,
    companyId: string | null,
    isPlatformAdmin: boolean,
    companies: AuthCompanyDto[],
    mustChangePassword = false,
  ): Promise<AuthResponseDto> {
    const accessPayload: JwtPayload = {
      sub: userId,
      companyId,
      isPlatformAdmin,
      mustChangePassword,
    };
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES', {
        infer: true,
      }),
    });

    const tokenId = randomUUID();
    const refreshPayload: JwtRefreshPayload = {
      sub: userId,
      companyId,
      isPlatformAdmin,
      mustChangePassword,
      jti: tokenId,
    };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES', {
        infer: true,
      }),
    });

    const { exp: accessExp, iat: accessIat } = this.jwtService.decode<{
      exp: number;
      iat: number;
    }>(accessToken);
    const { exp: refreshExp } = this.jwtService.decode<{ exp: number }>(
      refreshToken,
    );

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        expiresAt: new Date(refreshExp * MS_PER_SECOND),
      },
    });

    const dto = new AuthResponseDto();
    dto.accessToken = accessToken;
    dto.refreshToken = refreshToken;
    dto.tokenType = TOKEN_TYPE;
    dto.expiresIn = accessExp - accessIat;
    dto.companies = companies;
    dto.activeCompanyId = companyId;
    dto.mustChangePassword = mustChangePassword;
    return dto;
  }
}
