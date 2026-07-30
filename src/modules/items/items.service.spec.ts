import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { UomType } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ItemsService } from './items.service';

describe('ItemsService (FR-401)', () => {
  let prisma: PrismaService;
  let items: ItemsService;
  let companyId: string;
  let caller: AuthenticatedUser;
  let eachUomId: string;
  let kgUomId: string;
  let brandId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [ItemsService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    items = moduleRef.get(ItemsService);

    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    const company = await prisma.company.create({
      data: {
        name: `Item Co ${randomUUID().slice(0, 8)}`,
        baseCurrencyCode: 'USD',
      },
    });
    companyId = company.id;
    caller = {
      userId: randomUUID(),
      companyId,
      isPlatformAdmin: false,
      mustChangePassword: false,
    };

    const unitCat = await prisma.uomCategory.create({
      data: { companyId, name: 'Unit' },
    });
    const weightCat = await prisma.uomCategory.create({
      data: { companyId, name: 'Weight' },
    });
    const each = await prisma.uom.create({
      data: {
        companyId,
        categoryId: unitCat.id,
        name: 'Each',
        type: UomType.REFERENCE,
        factor: 1,
      },
    });
    const kg = await prisma.uom.create({
      data: {
        companyId,
        categoryId: weightCat.id,
        name: 'Kg',
        type: UomType.REFERENCE,
        factor: 1,
      },
    });
    eachUomId = each.id;
    kgUomId = kg.id;
    const brand = await prisma.brand.create({
      data: { companyId, name: 'Acme' },
    });
    brandId = brand.id;
  });

  afterAll(async () => {
    await prisma.item.deleteMany({ where: { companyId } });
    await prisma.brand.deleteMany({ where: { companyId } });
    await prisma.uom.deleteMany({ where: { companyId } });
    await prisma.uomCategory.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('creates an item, defaulting priceCurrency to the company base currency', async () => {
    const item = await items.create(
      {
        code: 'SKU-1',
        name: 'Mouse',
        baseUomId: eachUomId,
        brandId,
        salePrice: 9.99,
      },
      caller,
    );
    expect(item.code).toBe('SKU-1');
    expect(item.priceCurrency).toBe('USD');
    expect(item.salePrice).toBe(9.99);
    expect(item.baseUomId).toBe(eachUomId);
  });

  it('rejects a duplicate code in the same company', async () => {
    await expect(
      items.create(
        { code: 'SKU-1', name: 'Dup', baseUomId: eachUomId },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'ITEM_CODE_EXISTS' } });
  });

  it('rejects a sales UoM from a different category than the base UoM', async () => {
    await expect(
      items.create(
        {
          code: 'SKU-2',
          name: 'Bad UoM',
          baseUomId: eachUomId,
          salesUomId: kgUomId,
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'UOM_CATEGORY_MISMATCH' } });
  });

  it('rejects an unknown brand FK', async () => {
    await expect(
      items.create(
        {
          code: 'SKU-3',
          name: 'No Brand',
          baseUomId: eachUomId,
          brandId: randomUUID(),
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'LOOKUP_NOT_FOUND' } });
  });

  it('filters by brand and search, and soft-deletes', async () => {
    const list = await items.findAll(
      {
        page: 1,
        limit: 50,
        sortBy: 'code',
        sortOrder: 'asc',
        brandId,
        q: 'Mouse',
      },
      caller,
    );
    expect(list.data.some((i) => i.code === 'SKU-1')).toBe(true);

    const target = list.data.find((i) => i.code === 'SKU-1')!;
    await items.remove(target.id, caller);
    await expect(items.findOne(target.id, caller)).rejects.toMatchObject({
      response: { code: 'ITEM_NOT_FOUND' },
    });
  });
});
