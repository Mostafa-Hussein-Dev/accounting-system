import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import {
  DocumentType,
  LocationType,
  ResetPeriod,
  StockMovementType,
  UomType,
} from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SequencesService } from '../sequences/sequences.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StockService } from './stock.service';

describe('StockService (FR-402)', () => {
  let prisma: PrismaService;
  let stock: StockService;
  let companyId: string;
  let caller: AuthenticatedUser;
  let baseUomId: string;
  let internalA: string;
  let internalB: string;
  let supplier: string;
  let customer: string;
  let adjustment: string;
  let partnerBoth: string; // supplier AND customer
  let customerOnly: string;

  const makeItem = async (
    opts: { hasSize?: boolean } = {},
  ): Promise<string> => {
    const item = await prisma.item.create({
      data: {
        companyId,
        code: `IT-${randomUUID().slice(0, 8)}`,
        name: 'Widget',
        baseUomId,
        priceCurrency: 'USD',
        hasSize: opts.hasSize ?? false,
      },
    });
    return item.id;
  };

  // Convenience wrappers so every receipt/issue carries a valid partner.
  const receipt = (itemId: string, qty: number, unitCost: number) =>
    stock.createMovement(
      {
        type: StockMovementType.RECEIPT,
        itemId,
        partnerId: partnerBoth,
        fromLocationId: supplier,
        toLocationId: internalA,
        qty,
        unitCost,
      },
      caller,
    );
  const issue = (itemId: string, qty: number, from = internalA) =>
    stock.createMovement(
      {
        type: StockMovementType.ISSUE,
        itemId,
        partnerId: partnerBoth,
        fromLocationId: from,
        toLocationId: customer,
        qty,
      },
      caller,
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [StockService, SequencesService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    stock = moduleRef.get(StockService);

    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    const company = await prisma.company.create({
      data: {
        name: `Stock Co ${randomUUID().slice(0, 8)}`,
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
      data: { companyId, name: 'Quantity' },
    });
    const uom = await prisma.uom.create({
      data: {
        companyId,
        categoryId: cat.id,
        name: 'Each',
        type: UomType.REFERENCE,
        factor: 1,
      },
    });
    baseUomId = uom.id;

    const mkLoc = async (code: string, type: LocationType): Promise<string> => {
      const l = await prisma.location.create({
        data: { companyId, code, name: code, type },
      });
      return l.id;
    };
    internalA = await mkLoc('WH-A', LocationType.INTERNAL);
    internalB = await mkLoc('WH-B', LocationType.INTERNAL);
    supplier = await mkLoc('SUP', LocationType.SUPPLIER);
    customer = await mkLoc('CUS', LocationType.CUSTOMER);
    adjustment = await mkLoc('ADJ', LocationType.ADJUSTMENT);

    const both = await prisma.partner.create({
      data: {
        companyId,
        ref: 'P-BOTH',
        name: 'ACME',
        isSupplier: true,
        isCustomer: true,
      },
    });
    partnerBoth = both.id;
    const custOnly = await prisma.partner.create({
      data: { companyId, ref: 'P-CUST', name: 'Shopper', isCustomer: true },
    });
    customerOnly = custOnly.id;

    await prisma.documentSequence.create({
      data: {
        companyId,
        docType: DocumentType.STOCK_MOVEMENT,
        prefix: 'STK-',
        padWidth: 4,
        resetPeriod: ResetPeriod.YEARLY,
        nextNumber: 1,
      },
    });
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { companyId } });
    await prisma.documentSequence.deleteMany({ where: { companyId } });
    await prisma.partner.deleteMany({ where: { companyId } });
    await prisma.location.deleteMany({ where: { companyId } });
    await prisma.itemVariant.deleteMany({ where: { companyId } });
    await prisma.item.deleteMany({ where: { companyId } });
    await prisma.uom.deleteMany({ where: { companyId } });
    await prisma.uomCategory.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('receipts set the moving-average cost and on-hand', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 10, 5);
    const oh = await stock.onHand({ itemId }, caller);
    expect(oh.qty).toBe(10);
    expect(oh.avgCost).toBe(5);
    expect(oh.value).toBe(50);
  });

  it('a second receipt at a different cost recomputes the weighted average', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 10, 5);
    await receipt(itemId, 10, 7);
    const oh = await stock.onHand({ itemId }, caller);
    expect(oh.qty).toBe(20);
    expect(oh.avgCost).toBe(6); // (10*5 + 10*7) / 20
    expect(oh.value).toBe(120);
  });

  it('an issue is valued at the current average and leaves it unchanged', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 10, 5);
    await receipt(itemId, 10, 7);
    const moved = await issue(itemId, 5);
    expect(moved.unitCost).toBe(6);
    expect(moved.value).toBe(30);
    expect(moved.partnerId).toBe(partnerBoth);
    const oh = await stock.onHand({ itemId }, caller);
    expect(oh.qty).toBe(15);
    expect(oh.avgCost).toBe(6);
  });

  it('a transfer relocates quantity without changing total on-hand or average', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 10, 4);
    await stock.transfer(
      { itemId, fromLocationId: internalA, toLocationId: internalB, qty: 3 },
      caller,
    );
    const atA = await stock.onHand({ itemId, locationId: internalA }, caller);
    const atB = await stock.onHand({ itemId, locationId: internalB }, caller);
    const total = await stock.onHand({ itemId }, caller);
    expect(atA.qty).toBe(7);
    expect(atB.qty).toBe(3);
    expect(total.qty).toBe(10);
    expect(total.avgCost).toBe(4);
  });

  it('blocks an issue that would drive a location negative', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 2, 4);
    await expect(issue(itemId, 5)).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_STOCK' },
    });
  });

  it('requires a variantId for an item that has variants', async () => {
    const itemId = await makeItem({ hasSize: true });
    await expect(receipt(itemId, 1, 4)).rejects.toMatchObject({
      response: { code: 'VARIANT_REQUIRED_FOR_STOCK' },
    });
  });

  it('rejects a movement typed against the wrong direction', async () => {
    const itemId = await makeItem();
    // ISSUE from a supplier (virtual) → internal is really an inbound.
    await expect(
      stock.createMovement(
        {
          type: StockMovementType.ISSUE,
          itemId,
          partnerId: partnerBoth,
          fromLocationId: supplier,
          toLocationId: internalA,
          qty: 1,
          unitCost: 4,
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'MOVEMENT_TYPE_MISMATCH' } });
  });

  it('reconciles a physical count via an adjustment (no partner)', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 10, 5);
    const adj = await stock.adjust(
      { itemId, locationId: internalA, countedQty: 8 },
      caller,
    );
    expect(adj.type).toBe(StockMovementType.ADJUSTMENT);
    expect(adj.toLocationId).toBe(adjustment);
    expect(adj.qty).toBe(2);
    expect(adj.partnerId).toBeNull();
    const oh = await stock.onHand({ itemId, locationId: internalA }, caller);
    expect(oh.qty).toBe(8);
  });

  it('requires a partner on a receipt', async () => {
    const itemId = await makeItem();
    await expect(
      stock.createMovement(
        {
          type: StockMovementType.RECEIPT,
          itemId,
          fromLocationId: supplier,
          toLocationId: internalA,
          qty: 1,
          unitCost: 4,
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'PARTNER_REQUIRED' } });
  });

  it('rejects a partner that is not a supplier on a receipt', async () => {
    const itemId = await makeItem();
    await expect(
      stock.createMovement(
        {
          type: StockMovementType.RECEIPT,
          itemId,
          partnerId: customerOnly,
          fromLocationId: supplier,
          toLocationId: internalA,
          qty: 1,
          unitCost: 4,
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'PARTNER_NOT_SUPPLIER' } });
  });

  it('rejects a partner on an internal transfer', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 5, 4);
    await expect(
      stock.createMovement(
        {
          type: StockMovementType.TRANSFER,
          itemId,
          partnerId: partnerBoth,
          fromLocationId: internalA,
          toLocationId: internalB,
          qty: 1,
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'PARTNER_NOT_APPLICABLE' } });
  });

  it('bulk on-hand: multiple items, filtering and per-location breakdown', async () => {
    const i1 = await makeItem();
    const i2 = await makeItem();
    await receipt(i1, 5, 2); // i1 @ A = 5
    await receipt(i2, 3, 4); // i2 @ A = 3
    await stock.transfer(
      {
        itemId: i2,
        fromLocationId: internalA,
        toLocationId: internalB,
        qty: 1,
      },
      caller,
    ); // i2: A=2, B=1

    // total across locations, for the two items
    const total = await stock.bulkOnHand(
      { itemIds: [i1, i2], breakdown: 'total' },
      caller,
    );
    expect(total.meta.total).toBe(2);
    const r1 = total.data.find((r) => r.itemId === i1)!;
    expect(r1.qty).toBe(5);
    expect(r1.locationId).toBeNull();
    const r2 = total.data.find((r) => r.itemId === i2)!;
    expect(r2.qty).toBe(3);

    // per-location breakdown for i2 → two rows (A=2, B=1)
    const byLoc = await stock.bulkOnHand(
      { itemIds: [i2], breakdown: 'byLocation' },
      caller,
    );
    expect(byLoc.data.map((r) => r.qty).sort()).toEqual([1, 2]);
    expect(byLoc.data.every((r) => r.locationId && r.locationCode)).toBe(true);

    // narrow to one location
    const atB = await stock.bulkOnHand(
      { itemIds: [i2], breakdown: 'byLocation', locationId: internalB },
      caller,
    );
    expect(atB.data).toHaveLength(1);
    expect(atB.data[0].qty).toBe(1);
  });
});
