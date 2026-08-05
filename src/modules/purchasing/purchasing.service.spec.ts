import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import {
  DocumentType,
  JournalSide,
  ResetPeriod,
  UomType,
} from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SequencesService } from '../sequences/sequences.service';
import { StockService } from '../stock/stock.service';
import { GlService } from '../gl/gl.service';
import { PostingService } from '../gl/posting.service';
import { LedgerService } from '../gl/ledger.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PurchaseOrdersService } from './purchase-orders.service';
import { GoodsReceiptsService } from './goods-receipts.service';
import { VendorBillsService } from './vendor-bills.service';

describe('Purchasing (FR-501) — full flow', () => {
  let prisma: PrismaService;
  let orders: PurchaseOrdersService;
  let receipts: GoodsReceiptsService;
  let bills: VendorBillsService;
  let companyId: string;
  let caller: AuthenticatedUser;
  let itemId: string;
  let supplierId: string;
  let internalLoc: string;
  let apAccountId: string;
  let inventoryAccountId: string;
  let vatInAccountId: string;
  let taxRateId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [
        PurchaseOrdersService,
        GoodsReceiptsService,
        VendorBillsService,
        StockService,
        SequencesService,
        GlService,
        PostingService,
        LedgerService,
        AuditService,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    orders = moduleRef.get(PurchaseOrdersService);
    receipts = moduleRef.get(GoodsReceiptsService);
    bills = moduleRef.get(VendorBillsService);

    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    const company = await prisma.company.create({
      data: {
        name: `Purch Co ${randomUUID().slice(0, 8)}`,
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

    const mkAccount = async (
      number: string,
      name: string,
      accountClass: number,
      type: 'ASSET' | 'LIABILITY',
      normal: 'DEBIT' | 'CREDIT',
      controlType: 'INVENTORY' | 'AP' | 'VAT_IN',
    ): Promise<string> => {
      const a = await prisma.account.create({
        data: {
          companyId,
          number,
          name,
          accountClass,
          type,
          normalBalance: normal,
          isControl: true,
          controlType,
        },
      });
      return a.id;
    };
    inventoryAccountId = await mkAccount(
      '37',
      'Merchandise',
      3,
      'ASSET',
      'DEBIT',
      'INVENTORY',
    );
    apAccountId = await mkAccount(
      '40',
      'Suppliers',
      4,
      'LIABILITY',
      'CREDIT',
      'AP',
    );
    vatInAccountId = await mkAccount(
      '4426',
      'Input VAT',
      4,
      'ASSET',
      'DEBIT',
      'VAT_IN',
    );

    const taxRate = await prisma.taxRate.create({
      data: {
        companyId,
        name: 'VAT 11%',
        ratePct: 11,
        treatment: 'STANDARD',
        effectiveDate: new Date('2020-01-01'),
        vatInAccountId,
      },
    });
    taxRateId = taxRate.id;

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
    const item = await prisma.item.create({
      data: {
        companyId,
        code: `IT-${randomUUID().slice(0, 8)}`,
        name: 'Widget',
        baseUomId: uom.id,
        priceCurrency: 'USD',
        vatTreatment: 'STANDARD',
        defaultTaxRateId: taxRateId,
      },
    });
    itemId = item.id;

    const supplier = await prisma.partner.create({
      data: {
        companyId,
        ref: 'SUP-1',
        name: 'ACME Supplies',
        isSupplier: true,
        payableAccountId: apAccountId,
      },
    });
    supplierId = supplier.id;

    internalLoc = (
      await prisma.location.create({
        data: { companyId, code: 'WH', name: 'Warehouse', type: 'INTERNAL' },
      })
    ).id;
    await prisma.location.create({
      data: { companyId, code: 'SUP', name: 'Suppliers', type: 'SUPPLIER' },
    });

    for (const docType of [
      DocumentType.PURCHASE_ORDER,
      DocumentType.GOODS_RECEIPT,
      DocumentType.PURCHASE_INVOICE,
      DocumentType.JOURNAL_ENTRY,
      DocumentType.STOCK_MOVEMENT,
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
    await prisma.journalLine.deleteMany({ where: { companyId } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.stockMovement.deleteMany({ where: { companyId } });
    await prisma.goodsReceiptLine.deleteMany({ where: { companyId } });
    await prisma.goodsReceipt.deleteMany({ where: { companyId } });
    await prisma.vendorBillLine.deleteMany({ where: { companyId } });
    await prisma.vendorBill.deleteMany({ where: { companyId } });
    await prisma.purchaseOrderLine.deleteMany({ where: { companyId } });
    await prisma.purchaseOrder.deleteMany({ where: { companyId } });
    await prisma.location.deleteMany({ where: { companyId } });
    await prisma.partner.deleteMany({ where: { companyId } });
    await prisma.item.deleteMany({ where: { companyId } });
    await prisma.taxRate.deleteMany({ where: { companyId } });
    await prisma.uom.deleteMany({ where: { companyId } });
    await prisma.uomCategory.deleteMany({ where: { companyId } });
    await prisma.documentSequence.deleteMany({ where: { companyId } });
    await prisma.account.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('PO -> receive -> vendor bill posts a balanced GL entry and updates stock', async () => {
    // 1. Purchase order: 10 @ $5, VAT 11%.
    const po = await orders.create(
      {
        supplierId,
        currencyCode: 'USD',
        orderDate: '2026-08-01',
        lines: [{ itemId, qtyOrdered: 10, unitCost: 5 }],
      },
      caller,
    );
    expect(po.subtotal).toBe(50);
    expect(po.vatTotal).toBe(5.5);
    expect(po.grandTotal).toBe(55.5);
    expect(po.status).toBe('DRAFT');

    await orders.confirm(po.id, caller);

    // 2. Receive the full quantity → stock in at avg cost 5.
    const gr = await receipts.receive(
      {
        purchaseOrderId: po.id,
        locationId: internalLoc,
        receiptDate: '2026-08-02',
        lines: [{ purchaseOrderLineId: po.lines[0].id, qtyReceived: 10 }],
      },
      caller,
    );
    expect(gr.status).toBe('CONFIRMED');
    expect(gr.lines[0].stockMovementId).toBeTruthy();

    const onHand = await prisma.stockMovement.aggregate({
      _sum: { qty: true, value: true },
      where: { companyId, itemId, toLocationId: internalLoc },
    });
    expect(Number(onHand._sum.qty)).toBe(10);
    expect(Number(onHand._sum.value)).toBe(50); // 10 * $5

    const poAfter = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
    });
    expect(poAfter.status).toBe('RECEIVED');

    // 3. Vendor bill → posts DR inventory 50 + DR VAT 5.5 + CR AP 55.5.
    const bill = await bills.create(
      {
        supplierId,
        purchaseOrderId: po.id,
        currencyCode: 'USD',
        billDate: '2026-08-03',
        lines: [
          { itemId, qty: 10, unitCost: 5, purchaseOrderLineId: po.lines[0].id },
        ],
      },
      caller,
    );
    expect(bill.status).toBe('DRAFT');
    expect(bill.grandTotal).toBe(55.5);

    const posted = await bills.confirm(bill.id, caller);
    expect(posted.status).toBe('POSTED');
    expect(posted.journalEntryId).toBeTruthy();

    const je = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: posted.journalEntryId! },
      include: { lines: true },
    });
    expect(je.status).toBe('POSTED');
    const debit = je.lines
      .filter((l) => l.side === JournalSide.DEBIT)
      .reduce((s, l) => s + Number(l.amountBase), 0);
    const credit = je.lines
      .filter((l) => l.side === JournalSide.CREDIT)
      .reduce((s, l) => s + Number(l.amountBase), 0);
    expect(debit).toBeCloseTo(55.5, 2);
    expect(credit).toBeCloseTo(55.5, 2);

    const inv = je.lines.find((l) => l.accountId === inventoryAccountId)!;
    const vat = je.lines.find((l) => l.accountId === vatInAccountId)!;
    const ap = je.lines.find((l) => l.accountId === apAccountId)!;
    expect(Number(inv.amountBase)).toBe(50);
    expect(inv.side).toBe(JournalSide.DEBIT);
    expect(Number(vat.amountBase)).toBe(5.5);
    expect(vat.side).toBe(JournalSide.DEBIT);
    expect(Number(ap.amountBase)).toBe(55.5);
    expect(ap.side).toBe(JournalSide.CREDIT);
    expect(ap.partnerId).toBe(supplierId); // AP carries the supplier sub-ledger

    // 4. PO advanced to BILLED.
    const poBilled = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
    });
    expect(poBilled.status).toBe('BILLED');
  });

  it('rejects receiving more than ordered (over-receipt)', async () => {
    const po = await orders.create(
      {
        supplierId,
        currencyCode: 'USD',
        orderDate: '2026-08-01',
        lines: [{ itemId, qtyOrdered: 5, unitCost: 2 }],
      },
      caller,
    );
    await orders.confirm(po.id, caller);
    await expect(
      receipts.receive(
        {
          purchaseOrderId: po.id,
          locationId: internalLoc,
          receiptDate: '2026-08-02',
          lines: [{ purchaseOrderLineId: po.lines[0].id, qtyReceived: 9 }],
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'OVER_RECEIPT' } });
  });

  it('defaults a PO line unit cost from the item cost price when omitted', async () => {
    const pricedItem = await prisma.item.create({
      data: {
        companyId,
        code: `IT-${randomUUID().slice(0, 8)}`,
        name: 'Priced',
        baseUomId: (await prisma.uom.findFirstOrThrow({ where: { companyId } }))
          .id,
        priceCurrency: 'USD',
        costPrice: 7.25,
      },
    });
    const po = await orders.create(
      {
        supplierId,
        currencyCode: 'USD',
        orderDate: '2026-08-01',
        lines: [{ itemId: pricedItem.id, qtyOrdered: 4 }], // no unitCost
      },
      caller,
    );
    expect(po.lines[0].unitCost).toBe(7.25);
    expect(po.subtotal).toBe(29); // 4 * 7.25
  });

  it('rejects a non-supplier partner on a PO', async () => {
    const notSupplier = await prisma.partner.create({
      data: {
        companyId,
        ref: `C-${randomUUID().slice(0, 6)}`,
        name: 'Cust',
        isCustomer: true,
      },
    });
    await expect(
      orders.create(
        {
          supplierId: notSupplier.id,
          currencyCode: 'USD',
          orderDate: '2026-08-01',
          lines: [{ itemId, qtyOrdered: 1, unitCost: 1 }],
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'PARTNER_NOT_SUPPLIER' } });
  });

  // --- over-billing guard (quantity floor) ---------------------------------

  const makePo = async (qtyOrdered: number) => {
    const po = await orders.create(
      {
        supplierId,
        currencyCode: 'USD',
        orderDate: '2026-08-01',
        lines: [{ itemId, qtyOrdered, unitCost: 5 }],
      },
      caller,
    );
    await orders.confirm(po.id, caller);
    return po;
  };
  const bill = async (
    po: { id: string; lines: { id: string }[] },
    qty: number,
  ) => {
    const b = await bills.create(
      {
        supplierId,
        purchaseOrderId: po.id,
        currencyCode: 'USD',
        billDate: '2026-08-03',
        lines: [
          { itemId, qty, unitCost: 5, purchaseOrderLineId: po.lines[0].id },
        ],
      },
      caller,
    );
    return bills.confirm(b.id, caller);
  };

  it('blocks a duplicate full bill on a PO line (PO_LINE_OVER_BILLED)', async () => {
    const po = await makePo(10);
    await bill(po, 10); // fully billed
    await expect(bill(po, 10)).rejects.toMatchObject({
      response: { code: 'PO_LINE_OVER_BILLED' },
    });
  });

  it('blocks a second duplicate DRAFT bill before either is posted', async () => {
    const po = await makePo(10);
    const draftBody = {
      supplierId,
      purchaseOrderId: po.id,
      currencyCode: 'USD',
      billDate: '2026-08-03',
      lines: [
        { itemId, qty: 10, unitCost: 5, purchaseOrderLineId: po.lines[0].id },
      ],
    };
    await bills.create(draftBody, caller); // first DRAFT, not confirmed
    await expect(bills.create(draftBody, caller)).rejects.toMatchObject({
      response: { code: 'PO_LINE_OVER_BILLED' },
    });
  });

  it('allows a legitimate split but blocks going over the ordered qty', async () => {
    const po = await makePo(10);
    await bill(po, 6);
    await bill(po, 4); // 6 + 4 = 10, ok
    await expect(bill(po, 1)).rejects.toMatchObject({
      response: { code: 'PO_LINE_OVER_BILLED' },
    });
  });

  it('does not cap a bill line with no purchaseOrderLineId (ad-hoc)', async () => {
    const b = await bills.create(
      {
        supplierId,
        currencyCode: 'USD',
        billDate: '2026-08-03',
        lines: [{ itemId, qty: 999, unitCost: 5 }], // no PO line link
      },
      caller,
    );
    const posted = await bills.confirm(b.id, caller);
    expect(posted.status).toBe('POSTED');
  });

  it('rejects a bill line linked to a PO line from a different PO', async () => {
    const poA = await makePo(5);
    const poB = await makePo(5);
    await expect(
      bills.create(
        {
          supplierId,
          purchaseOrderId: poA.id,
          currencyCode: 'USD',
          billDate: '2026-08-03',
          lines: [
            {
              itemId,
              qty: 1,
              unitCost: 5,
              purchaseOrderLineId: poB.lines[0].id,
            },
          ],
        },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'PO_LINE_MISMATCH' } });
  });
});
