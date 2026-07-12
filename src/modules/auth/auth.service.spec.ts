import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { HttpException } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { CompaniesService } from '../companies/companies.service';
import { MailerService } from '../../common/mailer/mailer.service';

describe('AuthService — forgotPassword / resetPassword', () => {
  let prisma: PrismaService;
  let service: AuthService;
  let sendPasswordResetCode: jest.Mock;
  let companyId: string;
  let userId: string;
  let userEmail: string;

  /** Captures the code AuthService "emailed" via the mocked MailerService —
   * the same thing an e2e test would do by reading Mailpit instead. */
  function lastSentCode(): string {
    const lastCall =
      sendPasswordResetCode.mock.calls[sendPasswordResetCode.mock.calls.length - 1];
    return lastCall[0].code;
  }

  beforeAll(async () => {
    sendPasswordResetCode = jest.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule, JwtModule.register({})],
      providers: [
        AuthService,
        UsersService,
        CompaniesService,
        { provide: MailerService, useValue: { sendPasswordResetCode } },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(AuthService);

    const suffix = randomUUID();
    const company = await prisma.company.create({
      data: { name: 'Auth Test Co', taxNumber: `AUTH-TEST-${suffix}` },
    });
    companyId = company.id;

    const usersService = moduleRef.get(UsersService);
    userEmail = `auth-test-${suffix}@example.com`;
    const user = await usersService.create({
      firstName: 'Jane',
      lastName: 'Doe',
      email: userEmail,
      password: 'OriginalP@ssword1',
      companyId,
    });
    userId = user.id;
  });

  afterEach(() => {
    sendPasswordResetCode.mockClear();
  });

  afterAll(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  describe('forgotPassword', () => {
    it('resolves silently for an email that does not exist (anti-enumeration)', async () => {
      await expect(
        service.forgotPassword({ email: 'nobody@example.com' }),
      ).resolves.toBeUndefined();
      expect(sendPasswordResetCode).not.toHaveBeenCalled();
    });

    it('sends a 6-digit code and creates exactly one live token for a real user', async () => {
      await service.forgotPassword({ email: userEmail });

      expect(sendPasswordResetCode).toHaveBeenCalledTimes(1);
      const code = lastSentCode();
      expect(code).toMatch(/^\d{6}$/);

      const liveTokens = await prisma.passwordResetToken.findMany({
        where: { userId, consumedAt: null },
      });
      expect(liveTokens).toHaveLength(1);
    });

    it('does not send a second email within the cooldown window', async () => {
      sendPasswordResetCode.mockClear();
      await service.forgotPassword({ email: userEmail });
      expect(sendPasswordResetCode).not.toHaveBeenCalled();
    });

    it('supersedes the previous code once the cooldown has passed', async () => {
      // Establish a known "before" code within this test, rather than
      // depending on state left over from a previous one.
      await prisma.passwordResetToken.updateMany({
        where: { userId, consumedAt: null },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });
      await service.forgotPassword({ email: userEmail });
      const before = lastSentCode();
      sendPasswordResetCode.mockClear();

      // Simulate the cooldown having elapsed instead of waiting 30s.
      await prisma.passwordResetToken.updateMany({
        where: { userId, consumedAt: null },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });

      await service.forgotPassword({ email: userEmail });
      expect(sendPasswordResetCode).toHaveBeenCalledTimes(1);
      const after = lastSentCode();
      expect(after).not.toBe(before);

      const liveTokens = await prisma.passwordResetToken.findMany({
        where: { userId, consumedAt: null },
      });
      expect(liveTokens).toHaveLength(1); // old one superseded, not just added to

      // The old code must no longer work.
      await expect(
        service.resetPassword({
          email: userEmail,
          code: before,
          newPassword: 'ShouldNotWork1!',
        }),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_INVALID_RESET_CODE' },
      });
    });
  });

  describe('resetPassword', () => {
    it('rejects a wrong code and increments attempts', async () => {
      await prisma.passwordResetToken.updateMany({
        where: { userId, consumedAt: null },
        data: { createdAt: new Date(Date.now() - 60_000) }, // clear cooldown
      });
      await service.forgotPassword({ email: userEmail });
      const token = await prisma.passwordResetToken.findFirstOrThrow({
        where: { userId, consumedAt: null },
      });
      expect(token.attempts).toBe(0);

      await expect(
        service.resetPassword({
          email: userEmail,
          code: '000000',
          newPassword: 'Whatever1!',
        }),
      ).rejects.toThrow(HttpException);

      const updated = await prisma.passwordResetToken.findUniqueOrThrow({
        where: { id: token.id },
      });
      expect(updated.attempts).toBe(1);
    });

    it('locks out after the max number of wrong attempts', async () => {
      const token = await prisma.passwordResetToken.findFirstOrThrow({
        where: { userId, consumedAt: null },
      });
      // Already at 1 attempt from the previous test; push it to the ceiling.
      await prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { attempts: 5 },
      });

      await expect(
        service.resetPassword({
          email: userEmail,
          code: '000000',
          newPassword: 'Whatever1!',
        }),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_TOO_MANY_ATTEMPTS' },
      });
    });

    it('rejects an expired code', async () => {
      await prisma.passwordResetToken.updateMany({
        where: { userId, consumedAt: null },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });
      await service.forgotPassword({ email: userEmail });
      const code = lastSentCode();

      await prisma.passwordResetToken.updateMany({
        where: { userId, consumedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await expect(
        service.resetPassword({ email: userEmail, code, newPassword: 'Whatever1!' }),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_INVALID_RESET_CODE' },
      });
    });

    it('resets the password on a correct code, consumes it, and revokes existing sessions', async () => {
      // Fresh, valid code.
      await prisma.passwordResetToken.updateMany({
        where: { userId, consumedAt: null },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });
      await service.forgotPassword({ email: userEmail });
      const code = lastSentCode();

      // A live session that a successful reset should kill.
      const activeRefreshToken = await prisma.refreshToken.create({
        data: {
          userId,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const newPassword = 'BrandNewP@ssword2';
      await service.resetPassword({ email: userEmail, code, newPassword });

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      await expect(bcrypt.compare(newPassword, user.passwordHash)).resolves.toBe(
        true,
      );

      const token = await prisma.passwordResetToken.findFirstOrThrow({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(token.consumedAt).not.toBeNull();

      const refreshed = await prisma.refreshToken.findUniqueOrThrow({
        where: { id: activeRefreshToken.id },
      });
      expect(refreshed.revokedAt).not.toBeNull();
    });

    it('rejects reusing an already-consumed code', async () => {
      const consumedToken = await prisma.passwordResetToken.findFirstOrThrow({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(consumedToken.consumedAt).not.toBeNull(); // sanity check on test order

      await expect(
        service.resetPassword({
          email: userEmail,
          code: '123456',
          newPassword: 'Whatever1!',
        }),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_INVALID_RESET_CODE' },
      });
    });
  });
});
