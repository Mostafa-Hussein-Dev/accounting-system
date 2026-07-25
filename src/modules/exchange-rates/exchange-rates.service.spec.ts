import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeRatesService } from './exchange-rates.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

// LBP is seeded, so exchange rates can reference it without extra setup.
const CURRENCY = 'LBP';

describe('ExchangeRatesService', () => {
  let prisma: PrismaService;
  let service: ExchangeRatesService;
  let companyAId: string;
  let companyBId: string;
  let platformAdmin: AuthenticatedUser;
  let callerA: AuthenticatedUser;
  let callerB: AuthenticatedUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [ExchangeRatesService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(ExchangeRatesService);

    const suffix = randomUUID();
    const companyA = await prisma.company.create({
      data: { name: 'FX Test Co A', taxNumber: `FX-A-${suffix}` },
    });
    const companyB = await prisma.company.create({
      data: { name: 'FX Test Co B', taxNumber: `FX-B-${suffix}` },
    });
    companyAId = companyA.id;
    companyBId = companyB.id;

    platformAdmin = { userId: 'admin', companyId: null, isPlatformAdmin: true, mustChangePassword: false };
    callerA = {
      userId: 'caller-a',
      companyId: companyAId,
      isPlatformAdmin: false, mustChangePassword: false,
    };
    callerB = {
      userId: 'caller-b',
      companyId: companyBId,
      isPlatformAdmin: false, mustChangePassword: false,
    };
  });

  afterAll(async () => {
    await prisma.exchangeRate.deleteMany({
      where: { companyId: { in: [companyAId, companyBId] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId] } },
    });
    await prisma.$disconnect();
  });

  it('lets a company-scoped caller create a rate in their own company', async () => {
    const rate = await service.create(
      {
        currencyCode: CURRENCY,
        rateType: 'Official',
        effectiveDate: '2026-01-01',
        rate: 89500,
      },
      callerA,
    );
    expect(rate.companyId).toBe(companyAId);
    expect(rate.currencyCode).toBe(CURRENCY);
    expect(rate.rate).toBe(89500);
    expect(rate.effectiveDate).toBe('2026-01-01');
  });

  it("forces companyId to the caller's own company, overriding a submitted one", async () => {
    const rate = await service.create(
      {
        currencyCode: CURRENCY,
        rateType: 'Market',
        effectiveDate: '2026-01-01',
        rate: 90000,
        companyId: companyBId,
      },
      callerA,
    );
    expect(rate.companyId).toBe(companyAId);
  });

  it('lets a platform admin target a company via companyId', async () => {
    const rate = await service.create(
      {
        currencyCode: CURRENCY,
        rateType: 'Official',
        effectiveDate: '2026-01-01',
        rate: 89000,
        companyId: companyBId,
      },
      platformAdmin,
    );
    expect(rate.companyId).toBe(companyBId);
  });

  it('rejects a platform admin create with an unknown companyId (404)', async () => {
    await expect(
      service.create(
        {
          currencyCode: CURRENCY,
          rateType: 'Official',
          effectiveDate: '2026-02-01',
          rate: 89000,
          companyId: randomUUID(),
        },
        platformAdmin,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects an unknown currency code (404 CURRENCY_NOT_FOUND)', async () => {
    await expect(
      service.create(
        {
          currencyCode: 'XZZ',
          rateType: 'Official',
          effectiveDate: '2026-01-01',
          rate: 5,
        },
        callerA,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a duplicate currency/type/date with 409', async () => {
    await expect(
      service.create(
        {
          currencyCode: CURRENCY,
          rateType: 'Official',
          effectiveDate: '2026-01-01',
          rate: 89600,
        },
        callerA,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("hides company A's rate from company B", async () => {
    const rate = await service.create(
      {
        currencyCode: CURRENCY,
        rateType: 'Custom',
        effectiveDate: '2026-03-01',
        rate: 91000,
      },
      callerA,
    );

    await expect(service.findOne(rate.id, callerB)).rejects.toThrow(
      NotFoundException,
    );

    const listB = await service.findAll(
      { page: 1, limit: 100, sortBy: 'createdAt', sortOrder: 'desc' },
      callerB,
    );
    expect(listB.data.map((r) => r.id)).not.toContain(rate.id);
  });

  it('selects the rate in force on a date (newest effectiveDate <= date)', async () => {
    await service.create(
      {
        currencyCode: CURRENCY,
        rateType: 'InForce',
        effectiveDate: '2026-06-01',
        rate: 89000,
      },
      callerA,
    );
    await service.create(
      {
        currencyCode: CURRENCY,
        rateType: 'InForce',
        effectiveDate: '2026-06-15',
        rate: 90000,
      },
      callerA,
    );

    const onJune10 = await service.findCurrent(
      { currencyCode: CURRENCY, rateType: 'InForce', date: '2026-06-10' },
      callerA,
    );
    expect(onJune10.rate).toBe(89000);

    const onJune20 = await service.findCurrent(
      { currencyCode: CURRENCY, rateType: 'InForce', date: '2026-06-20' },
      callerA,
    );
    expect(onJune20.rate).toBe(90000);
  });

  it('throws 404 when no rate is in force on the date', async () => {
    await expect(
      service.findCurrent(
        { currencyCode: CURRENCY, rateType: 'InForce', date: '2020-01-01' },
        callerA,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('filters the history by rateType', async () => {
    const list = await service.findAll(
      {
        page: 1,
        limit: 100,
        sortBy: 'effectiveDate',
        sortOrder: 'asc',
        rateType: 'InForce',
      },
      callerA,
    );
    expect(list.data.length).toBe(2);
    expect(list.data.every((r) => r.rateType === 'InForce')).toBe(true);
  });

  it('updates a rate value', async () => {
    const rate = await service.create(
      {
        currencyCode: CURRENCY,
        rateType: 'Editable',
        effectiveDate: '2026-07-01',
        rate: 88000,
      },
      callerA,
    );
    const updated = await service.update(rate.id, { rate: 88500 }, callerA);
    expect(updated.rate).toBe(88500);
  });

  it('hard-deletes a rate: the row is gone', async () => {
    const rate = await service.create(
      {
        currencyCode: CURRENCY,
        rateType: 'Deletable',
        effectiveDate: '2026-08-01',
        rate: 87000,
      },
      callerA,
    );
    await service.remove(rate.id, callerA);
    await expect(service.findOne(rate.id, callerA)).rejects.toThrow(
      NotFoundException,
    );
    const row = await prisma.exchangeRate.findUnique({
      where: { id: rate.id },
    });
    expect(row).toBeNull();
  });

  it("blocks company B from deleting company A's rate", async () => {
    const rate = await service.create(
      {
        currencyCode: CURRENCY,
        rateType: 'Guarded',
        effectiveDate: '2026-09-01',
        rate: 86000,
      },
      callerA,
    );
    await expect(service.remove(rate.id, callerB)).rejects.toThrow(
      NotFoundException,
    );
  });
});
