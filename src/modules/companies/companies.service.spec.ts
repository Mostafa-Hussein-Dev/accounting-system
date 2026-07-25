import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { TaxesService } from '../taxes/taxes.service';
import { SequencesService } from '../sequences/sequences.service';
import { CompaniesService } from './companies.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('CompaniesService (settings — FR-108)', () => {
  let prisma: PrismaService;
  let service: CompaniesService;
  const createdIds: string[] = [];

  const platformAdmin: AuthenticatedUser = {
    userId: 'admin',
    companyId: null,
    isPlatformAdmin: true, mustChangePassword: false,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      // CompaniesService now provisions via these seed services (used by
      // create(); the settings tests below create companies directly).
      providers: [
        CompaniesService,
        AccountsService,
        TaxesService,
        SequencesService,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(CompaniesService);
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  // Create a bare company directly (no provisioning), so settings tests stay
  // isolated from chart/VAT/sequence seeding.
  const make = (over: Record<string, unknown> = {}) =>
    prisma.company
      .create({
        data: { name: `Co ${randomUUID().slice(0, 8)}`, ...over },
      })
      .then((c) => {
        createdIds.push(c.id);
        return c;
      });

  it('defaults base currency to USD and fiscal-year start to January', async () => {
    const c = await make();
    expect(c.baseCurrencyCode).toBe('USD');
    expect(c.fiscalYearStartMonth).toBe(1);
  });

  it('create() rejects an unknown base currency (nothing is provisioned)', async () => {
    await expect(
      service.create({ name: 'Bad', baseCurrencyCode: 'XXX' }, platformAdmin),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns resolved settings with defaults for a fresh company', async () => {
    const c = await make();
    const s = await service.getSettings(c.id);
    expect(s.baseCurrencyCode).toBe('USD');
    expect(s.rounding).toEqual({ decimals: 2, mode: 'HALF_UP' });
    expect(s.enabledModules).toEqual([]);
    expect(s.featureFlags).toEqual({});
  });

  it('merges feature flags across patches and replaces rounding/modules', async () => {
    const c = await make();

    await service.updateSettings(c.id, {
      featureFlags: { creditNotes: true, whatsappSend: true },
      enabledModules: ['invoicing'],
      rounding: { decimals: 0, mode: 'HALF_EVEN' },
    });
    const after1 = await service.updateSettings(c.id, {
      featureFlags: { whatsappSend: false }, // toggle just one
      enabledModules: ['invoicing', 'purchasing'], // replaced wholesale
    });

    expect(after1.featureFlags).toEqual({
      creditNotes: true,
      whatsappSend: false,
    });
    expect(after1.enabledModules).toEqual(['invoicing', 'purchasing']);
    expect(after1.rounding).toEqual({ decimals: 0, mode: 'HALF_EVEN' });

    // persisted
    const reread = await service.getSettings(c.id);
    expect(reread.featureFlags).toEqual({
      creditNotes: true,
      whatsappSend: false,
    });
  });

  it('updates base currency via company update, rejecting an unknown code', async () => {
    const c = await make();
    const updated = await service.update(c.id, { baseCurrencyCode: 'LBP' });
    expect(updated.baseCurrencyCode).toBe('LBP');
    await expect(
      service.update(c.id, { baseCurrencyCode: 'ZZZ' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects company creation by a user without company.create (Member-only)', async () => {
    const co = await make();
    const memberRole = await prisma.role.findFirstOrThrow({
      where: { name: 'Company Member', isSystem: true },
    });
    const user = await prisma.user.create({
      data: {
        firstName: 'Member',
        lastName: 'Only',
        email: `co-perm-${randomUUID()}@example.com`,
        passwordHash: 'irrelevant',
      },
    });
    await prisma.userCompany.create({
      data: { userId: user.id, companyId: co.id },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: memberRole.id, companyId: co.id },
    });

    const caller: AuthenticatedUser = {
      userId: user.id,
      companyId: co.id,
      isPlatformAdmin: false, mustChangePassword: false,
    };
    // The Company Member role does not grant company.create -> forbidden,
    // regardless of active company.
    await expect(
      service.create({ name: 'Blocked Co' }, caller),
    ).rejects.toThrow(ForbiddenException);

    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userCompany.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
