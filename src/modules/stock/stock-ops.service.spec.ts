import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import {
  ControlType,
  DocumentType,
  FiscalPeriodStatus,
  JournalSide,
  LocationType,
  ResetPeriod,
  StockMovementType,
  StockTransferStatus,
  UomType,
} from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SequencesService } from '../sequences/sequences.service';
import { AuditService } from '../audit/audit.service';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StockService } from './stock.service';
import { StockCountsService } from './stock-counts.service';
import { StockTransfersService } from './stock-transfers.service';

// FR-403 / FR-404 — physical counts (with variance journal) and inter-branch
// transfers (value-neutral), against a real database.
describe('Stock counts & transfers (FR-403/FR-404)', () => {
  let prisma: PrismaService;
  let stock: StockService;
  let counts: StockCountsService;
  let transfers: StockTransfersService;
  let companyId: string;
  let caller: AuthenticatedUser;
  let baseUomId: string;
  let internalA: string;
  let internalB: string;
  let supplier: string;
  let inventoryAccId: string;
  let varianceAccId: string;
  let partnerBoth: string;

  const makeItem = async (): Promise<string> => {
    const item = await prisma.item.create({
      data: {
        companyId,
        code: `IT-${randomUUID().slice(0, 8)}`,
        name: 'Widget',
        baseUomId,
        priceCurrency: 'USD',
      },
    });
    return item.id;
  };

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

  // GL balance (Σ debit_base − Σ credit_base) for one account in this company.
  const acctBalance = async (accountId: string): Promise<number> => {
    const lines = await prisma.journalLine.findMany({
      where: { companyId, accountId },
    });
    let bal = 0;
    for (const l of lines) {
      bal +=
        l.side === JournalSide.DEBIT
          ? Number(l.amountBase)
          : -Number(l.amountBase);
    }
    return Math.round(bal * 1e4) / 1e4;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [
        StockService,
        StockCountsService,
        StockTransfersService,
        SequencesService,
        AuditService,
        FiscalPeriodsService,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    stock = moduleRef.get(StockService);
    counts = moduleRef.get(StockCountsService);
    transfers = moduleRef.get(StockTransfersService);

    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    const company = await prisma.company.create({
      data: {
        name: `Stock Ops Co ${randomUUID().slice(0, 8)}`,
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

    const mkLoc = async (
      code: string,
      type: LocationType,
      branchId?: string,
    ): Promise<string> => {
      const l = await prisma.location.create({
        data: { companyId, code, name: code, type, branchId },
      });
      return l.id;
    };
    internalA = await mkLoc('WH-A', LocationType.INTERNAL);
    internalB = await mkLoc('WH-B', LocationType.INTERNAL);
    supplier = await mkLoc('SUP', LocationType.SUPPLIER);
    await mkLoc('ADJ', LocationType.ADJUSTMENT);

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

    const inv = await prisma.account.create({
      data: {
        companyId,
        number: '37',
        name: 'Inventory',
        accountClass: 3,
        type: 'ASSET',
        normalBalance: 'DEBIT',
        isControl: true,
        controlType: ControlType.INVENTORY,
      },
    });
    inventoryAccId = inv.id;
    const variance = await prisma.account.create({
      data: {
        companyId,
        number: '603',
        name: 'Inventory variances',
        accountClass: 6,
        type: 'EXPENSE',
        normalBalance: 'DEBIT',
        isControl: true,
        controlType: ControlType.INVENTORY_ADJUSTMENT,
      },
    });
    varianceAccId = variance.id;

    for (const docType of [
      DocumentType.STOCK_MOVEMENT,
      DocumentType.STOCK_COUNT,
      DocumentType.STOCK_TRANSFER,
      DocumentType.JOURNAL_ENTRY,
    ]) {
      await prisma.documentSequence.create({
        data: {
          companyId,
          docType,
          prefix: `${docType}-`,
          padWidth: 4,
          resetPeriod: ResetPeriod.YEARLY,
          nextNumber: 1,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.stockCountLine.deleteMany({ where: { companyId } });
    await prisma.stockCount.deleteMany({ where: { companyId } });
    await prisma.stockTransferLine.deleteMany({ where: { companyId } });
    await prisma.stockTransfer.deleteMany({ where: { companyId } });
    await prisma.journalLine.deleteMany({ where: { companyId } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.stockMovement.deleteMany({ where: { companyId } });
    await prisma.fiscalPeriod.deleteMany({ where: { companyId } });
    await prisma.documentSequence.deleteMany({ where: { companyId } });
    await prisma.partner.deleteMany({ where: { companyId } });
    await prisma.account.deleteMany({ where: { companyId } });
    await prisma.location.deleteMany({ where: { companyId } });
    await prisma.item.deleteMany({ where: { companyId } });
    await prisma.uom.deleteMany({ where: { companyId } });
    await prisma.uomCategory.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('a shortage posts an adjustment movement and a loss journal', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 10, 5); // on-hand 10 @ 5
    const invBefore = await acctBalance(inventoryAccId);
    const varBefore = await acctBalance(varianceAccId);

    const draft = await counts.create(
      {
        locationId: internalA,
        countDate: '2027-03-10',
        lines: [{ itemId, countedQty: 8 }],
      },
      caller,
    );
    expect(draft.status).toBe('DRAFT');
    expect(draft.lines![0].systemQty).toBe(10);

    const posted = await counts.post(draft.id, caller);
    expect(posted.status).toBe('POSTED');
    expect(posted.varianceValueBase).toBe(-10); // 2 units × 5
    expect(posted.lines![0].varianceQty).toBe(-2);
    expect(posted.journalEntryId).not.toBeNull();

    const oh = await stock.onHand({ itemId, locationId: internalA }, caller);
    expect(oh.qty).toBe(8);

    // Inventory asset down 10; variance expense up 10.
    expect(await acctBalance(inventoryAccId)).toBe(invBefore - 10);
    expect(await acctBalance(varianceAccId)).toBe(varBefore + 10);
  });

  it('an overage posts a gain journal (DR inventory, CR variance)', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 5, 4); // on-hand 5 @ 4
    const invBefore = await acctBalance(inventoryAccId);
    const varBefore = await acctBalance(varianceAccId);

    const draft = await counts.create(
      {
        locationId: internalA,
        countDate: '2027-03-11',
        lines: [{ itemId, countedQty: 8 }],
      },
      caller,
    );
    const posted = await counts.post(draft.id, caller);
    expect(posted.varianceValueBase).toBe(12); // +3 × 4
    expect(await acctBalance(inventoryAccId)).toBe(invBefore + 12);
    expect(await acctBalance(varianceAccId)).toBe(varBefore - 12);
  });

  it('a count with no variance posts no journal', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 6, 3);
    const draft = await counts.create(
      {
        locationId: internalA,
        countDate: '2027-03-12',
        lines: [{ itemId, countedQty: 6 }],
      },
      caller,
    );
    const posted = await counts.post(draft.id, caller);
    expect(posted.status).toBe('POSTED');
    expect(posted.varianceValueBase).toBe(0);
    expect(posted.journalEntryId).toBeNull();
    expect(posted.lines![0].varianceQty).toBe(0);
  });

  it('posting a count into a locked period is rejected', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 4, 2);
    const draft = await counts.create(
      {
        locationId: internalA,
        countDate: '2027-06-15',
        lines: [{ itemId, countedQty: 3 }],
      },
      caller,
    );
    await prisma.fiscalPeriod.create({
      data: {
        companyId,
        year: 2027,
        month: 6,
        status: FiscalPeriodStatus.LOCKED,
        lockedAt: new Date(),
      },
    });
    await expect(counts.post(draft.id, caller)).rejects.toMatchObject({
      response: { code: 'PERIOD_LOCKED' },
    });
  });

  it('an approved transfer relocates stock between branches, value-neutral', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 10, 4); // 10 @ A
    const invBefore = await acctBalance(inventoryAccId);

    const draft = await transfers.create(
      {
        fromLocationId: internalA,
        toLocationId: internalB,
        transferDate: '2027-04-01',
        lines: [{ itemId, qty: 3 }],
      },
      caller,
    );
    expect(draft.status).toBe('DRAFT');

    const approved = await transfers.approve(draft.id, caller);
    expect(approved.status).toBe(StockTransferStatus.APPROVED);
    expect(approved.approvedById).toBe(caller.userId);

    const posted = await transfers.post(draft.id, caller);
    expect(posted.status).toBe('POSTED');
    expect(posted.lines![0].stockMovementId).not.toBeNull();

    const atA = await stock.onHand({ itemId, locationId: internalA }, caller);
    const atB = await stock.onHand({ itemId, locationId: internalB }, caller);
    const total = await stock.onHand({ itemId }, caller);
    expect(atA.qty).toBe(7);
    expect(atB.qty).toBe(3);
    expect(total.qty).toBe(10);
    expect(total.avgCost).toBe(4);
    // No journal entry for a value-neutral transfer.
    expect(await acctBalance(inventoryAccId)).toBe(invBefore);
  });

  it('a transfer exceeding on-hand is rejected at post', async () => {
    const itemId = await makeItem();
    await receipt(itemId, 2, 4);
    const draft = await transfers.create(
      {
        fromLocationId: internalA,
        toLocationId: internalB,
        transferDate: '2027-04-02',
        lines: [{ itemId, qty: 5 }],
      },
      caller,
    );
    await expect(transfers.post(draft.id, caller)).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_STOCK' },
    });
  });
});
