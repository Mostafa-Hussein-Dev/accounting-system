import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CompaniesService } from './companies.service';

describe('CompaniesService (settings — FR-108)', () => {
  let prisma: PrismaService;
  let service: CompaniesService;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [CompaniesService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(CompaniesService);
  });

  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  const make = (over: Record<string, unknown> = {}) =>
    service
      .create({ name: `Co ${randomUUID().slice(0, 8)}`, ...over })
      .then((c) => {
        createdIds.push(c.id);
        return c;
      });

  it('defaults base currency to USD and fiscal-year start to January', async () => {
    const c = await make();
    expect(c.baseCurrencyCode).toBe('USD');
    expect(c.fiscalYearStartMonth).toBe(1);
  });

  it('accepts a valid base currency and rejects an unknown one', async () => {
    const c = await make({ baseCurrencyCode: 'LBP', fiscalYearStartMonth: 10 });
    expect(c.baseCurrencyCode).toBe('LBP');
    expect(c.fiscalYearStartMonth).toBe(10);

    await expect(
      service.create({ name: 'Bad', baseCurrencyCode: 'XXX' }),
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
});
