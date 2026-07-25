import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { InvitationDuration } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../../common/mailer/mailer.service';
import { InvitationsService } from './invitations.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

// End-to-end against the real DB; mailer is mocked so nothing is sent.
describe('InvitationsService (FR — company invitations)', () => {
  let prisma: PrismaService;
  let service: InvitationsService;
  let sendInvitation: jest.Mock;

  let companyId: string;
  let memberRoleId: string;
  let admin: AuthenticatedUser;
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    sendInvitation = jest.fn().mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [
        InvitationsService,
        ConfigService,
        { provide: MailerService, useValue: { sendInvitation } },
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(InvitationsService);

    const company = await prisma.company.create({
      data: { name: `Inv Co ${randomUUID().slice(0, 8)}` },
    });
    companyId = company.id;
    const memberRole = await prisma.role.findFirstOrThrow({
      where: { name: 'Company Member', isSystem: true },
    });
    memberRoleId = memberRole.id;
    admin = {
      userId: randomUUID(),
      companyId,
      isPlatformAdmin: false,
      mustChangePassword: false,
    };
  });

  afterAll(async () => {
    await prisma.invitation.deleteMany({ where: { companyId } });
    if (cleanupUserIds.length) {
      await prisma.userRole.deleteMany({
        where: { userId: { in: cleanupUserIds } },
      });
      await prisma.userCompany.deleteMany({
        where: { userId: { in: cleanupUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    }
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  const inviteEmail = () => `inv-${randomUUID().slice(0, 8)}@example.com`;

  it('creates a pending invitation for a new email (with a temp password) and emails it', async () => {
    const email = inviteEmail();
    const inv = await service.create(
      {
        email,
        firstName: 'New',
        lastName: 'Person',
        roleIds: [memberRoleId],
        duration: InvitationDuration.ONE_WEEK,
      },
      admin,
    );
    expect(inv.accepted).toBe(false);
    expect(inv.email).toBe(email);
    expect(sendInvitation).toHaveBeenCalledTimes(1);
    // A brand-new email gets temp credentials in the email.
    const calls = sendInvitation.mock.calls as [{ tempPassword?: string }][];
    expect(calls[0][0].tempPassword).toBeDefined();

    const row = await prisma.invitation.findFirstOrThrow({ where: { email } });
    expect(row.tempPasswordHash).not.toBeNull();
  });

  it('accepting creates the user, grants membership + roles, and marks accepted', async () => {
    const email = inviteEmail();
    await service.create(
      {
        email,
        firstName: 'Accept',
        lastName: 'Me',
        roleIds: [memberRoleId],
        duration: InvitationDuration.ONE_DAY,
      },
      admin,
    );
    const row = await prisma.invitation.findFirstOrThrow({ where: { email } });

    const result = await service.accept(row.token);
    cleanupUserIds.push(result.userId);
    expect(result.isNewUser).toBe(true);
    expect(result.companyId).toBe(companyId);

    const membership = await prisma.userCompany.findFirst({
      where: { userId: result.userId, companyId },
    });
    expect(membership).not.toBeNull();
    const roles = await prisma.userRole.findMany({
      where: { userId: result.userId, companyId },
    });
    expect(roles.map((r) => r.roleId)).toContain(memberRoleId);
    // A user created from a temp password must change it before using the app.
    const createdUser = await prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
    });
    expect(createdUser.mustChangePassword).toBe(true);
    const after = await prisma.invitation.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(after.accepted).toBe(true);
  });

  it('rejects accepting the same invitation twice', async () => {
    const email = inviteEmail();
    await service.create(
      {
        email,
        firstName: 'Twice',
        lastName: 'Accept',
        roleIds: [memberRoleId],
        duration: InvitationDuration.ONE_DAY,
      },
      admin,
    );
    const row = await prisma.invitation.findFirstOrThrow({ where: { email } });
    const result = await service.accept(row.token);
    cleanupUserIds.push(result.userId);

    await expect(service.accept(row.token)).rejects.toThrow(ConflictException);
  });

  it('rejects a second pending invitation for the same email', async () => {
    const email = inviteEmail();
    const dto = {
      email,
      firstName: 'Dup',
      lastName: 'Invite',
      roleIds: [memberRoleId],
      duration: InvitationDuration.ONE_WEEK,
    };
    await service.create(dto, admin);
    await expect(service.create(dto, admin)).rejects.toThrow(ConflictException);
  });

  it('rejects inviting an existing member of the company', async () => {
    // Create a user already in the company.
    const user = await prisma.user.create({
      data: {
        firstName: 'Existing',
        lastName: 'Member',
        email: inviteEmail(),
        passwordHash: 'irrelevant',
      },
    });
    cleanupUserIds.push(user.id);
    await prisma.userCompany.create({ data: { userId: user.id, companyId } });

    await expect(
      service.create(
        {
          email: user.email,
          firstName: 'Existing',
          lastName: 'Member',
          roleIds: [memberRoleId],
          duration: InvitationDuration.ONE_DAY,
        },
        admin,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
