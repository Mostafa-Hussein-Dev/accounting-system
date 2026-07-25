import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationDuration } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../../common/mailer/mailer.service';
import { EnvConfig } from '../../config/env.schema';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { InvitationDurationOptionDto } from './dto/invitation-duration-option.dto';
import { AcceptInvitationResultDto } from './dto/accept-invitation-result.dto';

const BCRYPT_SALT_ROUNDS = 12;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Single source of truth for each duration: how many days it lasts and the
// human label the frontend shows in its dropdown (GET /invitations/durations).
const DURATION_META: Record<
  InvitationDuration,
  { days: number; label: string }
> = {
  ONE_DAY: { days: 1, label: 'One day' },
  THREE_DAYS: { days: 3, label: 'Three days' },
  ONE_WEEK: { days: 7, label: 'One week' },
  TWO_WEEKS: { days: 14, label: 'Two weeks' },
  THIRTY_DAYS: { days: 30, label: 'Thirty days' },
};

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** The selectable invitation durations (value + label + days) for the UI. */
  durations(): InvitationDurationOptionDto[] {
    return (Object.keys(DURATION_META) as InvitationDuration[]).map(
      (value) => ({
        value,
        label: DURATION_META[value].label,
        days: DURATION_META[value].days,
      }),
    );
  }

  /**
   * Send an invitation to join a company. Creates NO user yet — just a pending
   * Invitation row (create-on-acceptance). A brand-new email gets a temp
   * password (emailed with the accept link); an existing account gets only the
   * link and uses its own login.
   */
  async create(
    dto: CreateInvitationDto,
    caller: AuthenticatedUser,
  ): Promise<InvitationResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: `Company with id ${companyId} was not found.`,
        field: 'companyId',
      });
    }

    await this.assertRolesAssignable(dto.roleIds, companyId);

    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });
    if (existingUser) {
      const alreadyMember = await this.prisma.userCompany.findFirst({
        where: { userId: existingUser.id, companyId },
      });
      if (alreadyMember) {
        throw new ConflictException({
          code: 'USER_ALREADY_MEMBER',
          message: 'That user is already a member of this company.',
          field: 'email',
        });
      }
    }

    const livePending = await this.prisma.invitation.findFirst({
      where: {
        companyId,
        email: dto.email,
        accepted: false,
        expiresAt: { gt: new Date() },
      },
    });
    if (livePending) {
      throw new ConflictException({
        code: 'INVITATION_ALREADY_PENDING',
        message: 'A pending invitation for this email already exists.',
        field: 'email',
      });
    }

    const token = randomBytes(32).toString('hex');
    let tempPassword: string | undefined;
    let tempPasswordHash: string | null = null;
    if (!existingUser) {
      tempPassword = randomBytes(9).toString('base64url');
      tempPasswordHash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);
    }
    const expiresAt = new Date(
      Date.now() + DURATION_META[dto.duration].days * MS_PER_DAY,
    );

    const invitation = await this.prisma.invitation.create({
      data: {
        companyId,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roleIds: dto.roleIds,
        tempPasswordHash,
        token,
        duration: dto.duration,
        expiresAt,
        invitedById: caller.userId,
      },
    });

    await this.mailer.sendInvitation({
      to: dto.email,
      companyName: company.name,
      acceptUrl: this.buildAcceptUrl(token),
      tempPassword,
      expiresAt,
    });

    return InvitationResponseDto.fromEntity(invitation);
  }

  /**
   * Accept an invitation (public — the token is the credential). Creates the
   * user if the email had no account, grants membership + roles, and marks the
   * invitation accepted. Idempotent-safe: an already-accepted or expired token
   * is rejected.
   */
  async accept(token: string): Promise<AcceptInvitationResultDto> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });
    if (!invitation) {
      throw new BadRequestException({
        code: 'INVITATION_INVALID',
        message: 'This invitation link is invalid.',
        field: 'token',
      });
    }
    if (invitation.accepted) {
      throw new ConflictException({
        code: 'INVITATION_ALREADY_ACCEPTED',
        message: 'This invitation has already been accepted.',
        field: 'token',
      });
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'INVITATION_EXPIRED',
        message: 'This invitation has expired.',
        field: 'token',
      });
    }
    await this.assertRolesAssignable(invitation.roleIds, invitation.companyId);

    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findFirst({
        where: { email: invitation.email, deletedAt: null },
      });
      let isNewUser = false;
      if (!user) {
        if (!invitation.tempPasswordHash) {
          // Email had no account at accept time and no temp password was set.
          throw new BadRequestException({
            code: 'INVITATION_INVALID',
            message: 'This invitation can no longer be completed.',
            field: 'token',
          });
        }
        user = await tx.user.create({
          data: {
            firstName: invitation.firstName,
            lastName: invitation.lastName,
            email: invitation.email,
            passwordHash: invitation.tempPasswordHash,
            // Created from a temp password emailed in plaintext — force a change
            // before the account can be used for anything else (#2).
            mustChangePassword: true,
          },
        });
        isNewUser = true;
      }

      await tx.userCompany.upsert({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: invitation.companyId,
          },
        },
        update: {},
        create: { userId: user.id, companyId: invitation.companyId },
      });
      const grantUserId = user.id;
      await tx.userRole.createMany({
        data: invitation.roleIds.map((roleId) => ({
          userId: grantUserId,
          roleId,
          companyId: invitation.companyId,
        })),
        skipDuplicates: true,
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { accepted: true, acceptedAt: new Date() },
      });

      const result = new AcceptInvitationResultDto();
      result.companyId = invitation.companyId;
      result.userId = user.id;
      result.isNewUser = isNewUser;
      return result;
    });
  }

  /** List a company's invitations (the caller's active company, or a platform admin's target). */
  async findAll(
    caller: AuthenticatedUser,
    companyIdQuery?: string,
  ): Promise<InvitationResponseDto[]> {
    const companyId = this.resolveCompanyId(companyIdQuery, caller);
    const invitations = await this.prisma.invitation.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map(InvitationResponseDto.fromEntity);
  }

  /** Revoke (delete) a pending invitation belonging to the caller's company. */
  async revoke(id: string, caller: AuthenticatedUser): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
    });
    if (
      !invitation ||
      (!isPlatformAdmin(caller) && invitation.companyId !== caller.companyId)
    ) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: `Invitation with id ${id} was not found.`,
        field: null,
      });
    }
    await this.prisma.invitation.delete({ where: { id } });
  }

  // --- helpers ---

  private buildAcceptUrl(token: string): string {
    const origin = this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')[0]
      .trim();
    return `${origin}/invitations/accept?token=${token}`;
  }

  /** Roles must exist and be assignable in the company (global roles or the company's own). */
  private async assertRolesAssignable(
    roleIds: string[],
    companyId: string,
  ): Promise<void> {
    const roles = await this.prisma.role.findMany({
      where: {
        id: { in: roleIds },
        OR: [{ companyId: null }, { companyId }],
      },
      select: { id: true },
    });
    if (roles.length !== new Set(roleIds).size) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'One or more roleIds were not found for this company.',
        field: 'roleIds',
      });
    }
  }

  private resolveCompanyId(
    companyIdArg: string | undefined,
    caller: AuthenticatedUser,
  ): string {
    if (!isPlatformAdmin(caller)) {
      if (!caller.companyId) {
        throw new BadRequestException({
          code: 'COMPANY_CONTEXT_REQUIRED',
          message:
            'No active company selected. Use POST /auth/switch-company to choose one.',
          field: null,
        });
      }
      return caller.companyId;
    }
    if (!companyIdArg) {
      throw new BadRequestException({
        code: 'COMPANY_ID_REQUIRED',
        message: 'A platform admin must specify companyId.',
        field: 'companyId',
      });
    }
    return companyIdArg;
  }
}
