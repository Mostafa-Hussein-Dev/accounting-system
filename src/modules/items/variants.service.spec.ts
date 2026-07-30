import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { UomType } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { VariantsService } from './variants.service';

describe('VariantsService (FR-401)', () => {
  let prisma: PrismaService;
  let variants: VariantsService;
  let companyId: string;
  let caller: AuthenticatedUser;
  let itemId: string;
  let sizeS: string;
  let sizeM: string;
  let red: string;
  let blue: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [VariantsService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    variants = moduleRef.get(VariantsService);

    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    const company = await prisma.company.create({
      data: {
        name: `Var Co ${randomUUID().slice(0, 8)}`,
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

    const cat = await prisma.uomCategory.create({
      data: { companyId, name: 'Unit' },
    });
    const each = await prisma.uom.create({
      data: {
        companyId,
        categoryId: cat.id,
        name: 'Each',
        type: UomType.REFERENCE,
        factor: 1,
      },
    });
    const item = await prisma.item.create({
      data: {
        companyId,
        code: 'TSHIRT',
        name: 'T-Shirt',
        baseUomId: each.id,
        priceCurrency: 'USD',
        hasSize: true,
        hasColour: true,
      },
    });
    itemId = item.id;
    sizeS = (await prisma.size.create({ data: { companyId, name: 'S' } })).id;
    sizeM = (await prisma.size.create({ data: { companyId, name: 'M' } })).id;
    red = (await prisma.colour.create({ data: { companyId, name: 'Red' } })).id;
    blue = (await prisma.colour.create({ data: { companyId, name: 'Blue' } }))
      .id;
  });

  afterAll(async () => {
    await prisma.itemVariant.deleteMany({ where: { companyId } });
    await prisma.item.deleteMany({ where: { companyId } });
    await prisma.size.deleteMany({ where: { companyId } });
    await prisma.colour.deleteMany({ where: { companyId } });
    await prisma.uom.deleteMany({ where: { companyId } });
    await prisma.uomCategory.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('generates the size×colour matrix and skips existing combinations', async () => {
    const first = await variants.generate(
      itemId,
      { sizeIds: [sizeS, sizeM], colourIds: [red, blue] },
      caller,
    );
    expect(first.created).toBe(4); // 2 sizes × 2 colours
    expect(first.skipped).toBe(0);

    // Re-running with an overlapping matrix creates only the new combos.
    const second = await variants.generate(
      itemId,
      { sizeIds: [sizeS, sizeM], colourIds: [red] },
      caller,
    );
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);

    const list = await variants.findAll(itemId, caller);
    expect(list).toHaveLength(4);
  });

  it('rejects a manual duplicate combination and requires an attribute', async () => {
    await expect(
      variants.create(itemId, { sizeId: sizeS, colourId: red }, caller),
    ).rejects.toMatchObject({
      response: { code: 'VARIANT_COMBINATION_EXISTS' },
    });

    await expect(variants.create(itemId, {}, caller)).rejects.toMatchObject({
      response: { code: 'VARIANT_ATTRIBUTE_REQUIRED' },
    });
  });

  it('enforces SKU uniqueness per company', async () => {
    const cat = await variants.create(
      itemId,
      { sizeId: sizeS, sku: 'TS-S' },
      caller,
    );
    expect(cat.sku).toBe('TS-S');
    await expect(
      variants.create(itemId, { sizeId: sizeM, sku: 'TS-S' }, caller),
    ).rejects.toMatchObject({ response: { code: 'VARIANT_SKU_EXISTS' } });
  });
});
