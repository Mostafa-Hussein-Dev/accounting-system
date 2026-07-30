import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { UomType } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BarcodesService } from './barcodes.service';

describe('BarcodesService (FR-401)', () => {
  let prisma: PrismaService;
  let barcodes: BarcodesService;
  let companyId: string;
  let caller: AuthenticatedUser;
  let itemId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [BarcodesService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    barcodes = moduleRef.get(BarcodesService);

    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    const company = await prisma.company.create({
      data: {
        name: `BC Co ${randomUUID().slice(0, 8)}`,
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
    itemId = (
      await prisma.item.create({
        data: {
          companyId,
          code: 'BC-ITEM',
          name: 'Item',
          baseUomId: each.id,
          priceCurrency: 'USD',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.itemBarcode.deleteMany({ where: { companyId } });
    await prisma.item.deleteMany({ where: { companyId } });
    await prisma.uom.deleteMany({ where: { companyId } });
    await prisma.uomCategory.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('adds multiple barcodes and keeps at most one primary', async () => {
    const a = await barcodes.create(
      itemId,
      { barcode: '111', isPrimary: true },
      caller,
    );
    expect(a.isPrimary).toBe(true);
    const b = await barcodes.create(
      itemId,
      { barcode: '222', isPrimary: true },
      caller,
    );
    expect(b.isPrimary).toBe(true);

    const list = await barcodes.findAll(itemId, caller);
    expect(list.filter((x) => x.isPrimary)).toHaveLength(1);
    expect(list.find((x) => x.isPrimary)!.barcode).toBe('222');
  });

  it('rejects a duplicate barcode in the same company', async () => {
    await expect(
      barcodes.create(itemId, { barcode: '111' }, caller),
    ).rejects.toMatchObject({ response: { code: 'BARCODE_EXISTS' } });
  });

  it('resolves a barcode via lookup and 404s an unknown one', async () => {
    const found = await barcodes.lookup('222', caller);
    expect(found.itemId).toBe(itemId);
    await expect(
      barcodes.lookup('does-not-exist', caller),
    ).rejects.toMatchObject({
      response: { code: 'BARCODE_NOT_FOUND' },
    });
  });
});
