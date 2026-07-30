import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { UomType } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PricingService } from './pricing.service';

describe('PricingService (FR-401)', () => {
  let prisma: PrismaService;
  let pricing: PricingService;
  let companyId: string;
  let caller: AuthenticatedUser;
  let itemId: string;
  let variantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [PricingService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    pricing = moduleRef.get(PricingService);

    for (const [code, name, dp] of [
      ['USD', 'US Dollar', 2],
      ['LBP', 'Lebanese Pound', 0],
    ] as const) {
      await prisma.currency.upsert({
        where: { code },
        update: {},
        create: { code, name, symbol: code, decimalPlaces: dp },
      });
    }
    const company = await prisma.company.create({
      data: {
        name: `Price Co ${randomUUID().slice(0, 8)}`,
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
        code: 'P-1',
        name: 'Priced',
        baseUomId: each.id,
        priceCurrency: 'USD',
        salePrice: 10,
      },
    });
    itemId = item.id;
    variantId = (
      await prisma.itemVariant.create({
        data: { companyId, itemId, sku: 'P-1-V' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.pricelistLine.deleteMany({ where: { companyId } });
    await prisma.pricelist.deleteMany({ where: { companyId } });
    await prisma.itemVariant.deleteMany({ where: { companyId } });
    await prisma.item.deleteMany({ where: { companyId } });
    await prisma.uom.deleteMany({ where: { companyId } });
    await prisma.uomCategory.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('creates a default LBP pricelist and resolves qty breaks and variant overrides', async () => {
    const list = await pricing.create(
      { name: 'LBP Retail', currencyCode: 'LBP', isDefault: true },
      caller,
    );
    await pricing.addLine(
      list.id,
      { itemId, price: 900000, minQty: 1 },
      caller,
    );
    await pricing.addLine(
      list.id,
      { itemId, price: 800000, minQty: 10 },
      caller,
    );
    await pricing.addLine(
      list.id,
      { itemId, variantId, price: 850000, minQty: 1 },
      caller,
    );

    // qty 1, no variant -> item-level minQty 1
    const p1 = await pricing.resolvePrice(itemId, caller, { qty: 1 });
    expect(p1).toMatchObject({
      price: 900000,
      currency: 'LBP',
      source: 'pricelist',
    });

    // qty 12 -> item-level minQty 10 (highest applicable break)
    const p10 = await pricing.resolvePrice(itemId, caller, { qty: 12 });
    expect(p10.price).toBe(800000);

    // variant-specific wins over item-level
    const pv = await pricing.resolvePrice(itemId, caller, {
      qty: 1,
      variantId,
    });
    expect(pv.price).toBe(850000);
  });

  it('falls back to the item base sale price when no line matches', async () => {
    // A separate item with no pricelist lines.
    const other = await prisma.item.create({
      data: {
        companyId,
        code: 'P-2',
        name: 'Unpriced',
        baseUomId: (await prisma.uom.findFirstOrThrow({ where: { companyId } }))
          .id,
        priceCurrency: 'USD',
        salePrice: 42,
      },
    });
    const p = await pricing.resolvePrice(other.id, caller, { qty: 1 });
    expect(p).toMatchObject({
      price: 42,
      currency: 'USD',
      source: 'item',
      pricelistId: null,
    });
  });

  it('rejects a duplicate line (same item/variant/qty) and an unknown currency', async () => {
    const list = await pricing.findAll(caller);
    const listId = list[0].id;
    await expect(
      pricing.addLine(listId, { itemId, price: 111, minQty: 1 }, caller),
    ).rejects.toMatchObject({ response: { code: 'PRICELIST_LINE_EXISTS' } });

    await expect(
      pricing.create({ name: 'Bad', currencyCode: 'XXX' }, caller),
    ).rejects.toMatchObject({ response: { code: 'CURRENCY_NOT_FOUND' } });
  });
});
