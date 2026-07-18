import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrenciesService } from './currencies.service';

// ISO 4217 reserves the X-prefixed space for non-standard/test codes; these
// never collide with the seeded USD/LBP.
const TEST_CODES = ['XTS', 'XTA', 'XTB', 'XTD'];

describe('CurrenciesService', () => {
  let prisma: PrismaService;
  let service: CurrenciesService;
  let companyId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [CurrenciesService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(CurrenciesService);

    await prisma.exchangeRate.deleteMany({
      where: { currencyCode: { in: TEST_CODES } },
    });
    await prisma.currency.deleteMany({ where: { code: { in: TEST_CODES } } });

    const company = await prisma.company.create({
      data: {
        name: 'Currencies Test Co',
        taxNumber: `CUR-TEST-${randomUUID()}`,
      },
    });
    companyId = company.id;
  });

  afterAll(async () => {
    await prisma.exchangeRate.deleteMany({
      where: { currencyCode: { in: TEST_CODES } },
    });
    await prisma.currency.deleteMany({ where: { code: { in: TEST_CODES } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('creates a currency', async () => {
    const currency = await service.create({
      code: 'XTS',
      name: 'Test Currency',
      symbol: 'T$',
      decimalPlaces: 2,
    });
    expect(currency.code).toBe('XTS');
    expect(currency.decimalPlaces).toBe(2);
    expect(currency.isActive).toBe(true);
  });

  it('rejects a duplicate code with 409', async () => {
    await service.create({
      code: 'XTA',
      name: 'Dup Currency',
      symbol: 'D$',
      decimalPlaces: 0,
    });
    await expect(
      service.create({
        code: 'XTA',
        name: 'Dup Currency Again',
        symbol: 'D$',
        decimalPlaces: 0,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('finds a currency by code and lists it', async () => {
    const found = await service.findOne('XTS');
    expect(found.name).toBe('Test Currency');

    const list = await service.findAll({
      page: 1,
      limit: 100,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(list.data.map((c) => c.code)).toContain('XTS');
  });

  it('updates a currency, including deactivating it', async () => {
    const updated = await service.update('XTS', {
      isActive: false,
      symbol: 'X$',
    });
    expect(updated.isActive).toBe(false);
    expect(updated.symbol).toBe('X$');
  });

  it('throws 404 for an unknown code', async () => {
    await expect(service.findOne('XZZ')).rejects.toThrow(NotFoundException);
  });

  it('hard-deletes a currency', async () => {
    await service.create({
      code: 'XTD',
      name: 'Deletable',
      symbol: '@',
      decimalPlaces: 2,
    });
    await service.remove('XTD');
    await expect(service.findOne('XTD')).rejects.toThrow(NotFoundException);
    const row = await prisma.currency.findUnique({ where: { code: 'XTD' } });
    expect(row).toBeNull();
  });

  it('blocks deleting a currency referenced by an exchange rate (409 in-use)', async () => {
    await service.create({
      code: 'XTB',
      name: 'Referenced',
      symbol: 'R$',
      decimalPlaces: 2,
    });
    await prisma.exchangeRate.create({
      data: {
        companyId,
        currencyCode: 'XTB',
        rateType: 'Official',
        effectiveDate: new Date('2026-01-01'),
        rate: 100,
      },
    });
    await expect(service.remove('XTB')).rejects.toThrow(ConflictException);
  });
});
