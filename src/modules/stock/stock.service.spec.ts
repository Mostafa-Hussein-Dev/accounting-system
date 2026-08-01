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
    await stock.createMovement(
      {
        type: StockMovementType.RECEIPT,
        itemId,
        fromLocationId: supplier,
        toLocationId: internalA,
        qty: 10,
        unitCost: 5,
      },
      caller,
    );
    const oh = await stock.onHand({ itemId }, caller);
    expect(oh.qty).toBe(10);
    expect(oh.avgCost).toBe(5);
    expect(oh.value).toBe(50);
  });

  it('a second receipt at a different cost recomputes the weighted average', async () => {
    const itemId = await makeItem();
    await stock.createMovement(
      {
        type: StockMovementType.RECEIPT,
        itemId,
        fromLocationId: supplier,
        toLocationId: internalA,
        qty: 10,
        unitCost: 5,
      },
      caller,
    );
    await stock.createMovement(
      {
        type: StockMovementType.RECEIPT,
        itemId,
        fromLocationId: supplier,
        toLocationId: internalA,
        qty: 10,
        unitCost: 7,
      },
      caller,
    );
    const oh = await stock.onHand({ itemId }, caller);
    expect(oh.qty).toBe(20);
    expect(oh.avgCost).toBe(6); // (10*5 + 10*7) / 20
    expect(oh.value).toBe(120);
  });

  it('an issue is valued at the current average and leaves it unchanged', async () => {
    const itemId = await makeItem();
    await stock.createMovement(
      {
        type: StockMovementType.RECEIPT,
        itemId,
        fromLocationId: supplier,
        toLocationId: internalA,
        qty: 10,
        unitCost: 5,
      },
      caller,
    );
    await stock.createMovement(
      {
        type: StockMovementType.RECEIPT,
        itemId,
        fromLocationId: supplier,
        toLocationId: internalA,
        qty: 10,
        unitCost: 7,
      },
      caller,
    );
    const issue = await stock.createMovement(
      {
        type: StockMovementType.ISSUE,
        itemId,
        fromLocationId: internalA,
        toLocationId: customer,
        qty: 5,
      },
      caller,
    );
    expect(issue.unitCost).toBe(6);
    expect(issue.value).toBe(30);
    const oh = await stock.onHand({ itemId }, caller);
    expect(oh.qty).toBe(15);
    expect(oh.avgCost).toBe(6);
  });

  it('a transfer relocates quantity without changing total on-hand or average', async () => {
    const itemId = await makeItem();
    await stock.createMovement(
      {
        type: StockMovementType.RECEIPT,
        itemId,
        fromLocationId: supplier,
        toLocationId: internalA,
        qty: 10,
        unitCost: 4,
      },
      caller,
    );
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
    await stock.createMovement(
      {
        type: StockMovementType.RECEIPT,
        itemId,
        fromLocationId: supplier,
        toLocationId: internalA,
        qty: 2,
        unitCost: 4,
      },
      caller,
    );
    await expect(
      stock.createMovement(
        {
          type: StockMovementType.ISSUE,
          itemId,
          fromLocationId: internalA,
          toLocationId: customer,
          qty: 5,
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_STOCK' } });
  });

  it('requires a variantId for an item that has variants', async () => {
    const itemId = await makeItem({ hasSize: true });
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
    ).rejects.toMatchObject({
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
          fromLocationId: supplier,
          toLocationId: internalA,
          qty: 1,
          unitCost: 4,
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'MOVEMENT_TYPE_MISMATCH' } });
  });

  it('reconciles a physical count via an adjustment', async () => {
    const itemId = await makeItem();
    await stock.createMovement(
      {
        type: StockMovementType.RECEIPT,
        itemId,
        fromLocationId: supplier,
        toLocationId: internalA,
        qty: 10,
        unitCost: 5,
      },
      caller,
    );
    // Counted only 8 → a downward adjustment of 2.
    const adj = await stock.adjust(
      { itemId, locationId: internalA, countedQty: 8 },
      caller,
    );
    expect(adj.type).toBe(StockMovementType.ADJUSTMENT);
    expect(adj.toLocationId).toBe(adjustment);
    expect(adj.qty).toBe(2);
    const oh = await stock.onHand({ itemId, locationId: internalA }, caller);
    expect(oh.qty).toBe(8);
  });
});
