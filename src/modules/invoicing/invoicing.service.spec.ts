import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import {
  DocumentType,
  JournalSide,
  ResetPeriod,
  StockMovementType,
  UomType,
} from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SequencesService } from '../sequences/sequences.service';
import { StockService } from '../stock/stock.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SalesInvoicesService } from './sales-invoices.service';
import { CreditNotesService } from './credit-notes.service';

// FR-6xx Invoicing — real-DB integration test (same style as purchasing).
// Base currency USD so document amounts equal base amounts (rate 1).
describe('Invoicing (FR-6xx) — sales invoice + credit note', () => {
  let prisma: PrismaService;
  let stock: StockService;
  let invoices: SalesInvoicesService;
  let creditNotes: CreditNotesService;
  let companyId: string;
  let caller: AuthenticatedUser;
  let itemId: string;
  let serviceItemId: string;
  let customerId: string;
  let internalLoc: string;
  let arAccountId: string;
  let vatOutAccountId: string;
  let taxRateId: string;

  const acctOf = new Map<string, string>(); // id -> label

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [
        SalesInvoicesService,
        CreditNotesService,
        StockService,
        SequencesService,
        AuditService,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    stock = moduleRef.get(StockService);
    invoices = moduleRef.get(SalesInvoicesService);
    creditNotes = moduleRef.get(CreditNotesService);

    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    const company = await prisma.company.create({
      data: {
        name: `Sales Co ${randomUUID().slice(0, 8)}`,
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
      type: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE',
      normal: 'DEBIT' | 'CREDIT',
      controlType: 'AR' | 'REVENUE' | 'VAT_OUT' | 'COGS' | 'INVENTORY',
      label: string,
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
      acctOf.set(a.id, label);
      return a.id;
    };
    arAccountId = await mkAccount(
      '41',
      'Customers',
      4,
      'ASSET',
      'DEBIT',
      'AR',
      'AR',
    );
    await mkAccount('70', 'Sales', 7, 'REVENUE', 'CREDIT', 'REVENUE', 'REV');
    vatOutAccountId = await mkAccount(
      '4427',
      'Output VAT',
      4,
      'LIABILITY',
      'CREDIT',
      'VAT_OUT',
      'VAT',
    );
    await mkAccount('60', 'COGS', 6, 'EXPENSE', 'DEBIT', 'COGS', 'COGS');
    await mkAccount(
      '37',
      'Merchandise',
      3,
      'ASSET',
      'DEBIT',
      'INVENTORY',
      'INV',
    );

    const taxRate = await prisma.taxRate.create({
      data: {
        companyId,
        name: 'VAT 11%',
        ratePct: 11,
        treatment: 'STANDARD',
        effectiveDate: new Date('2020-01-01'),
        vatOutAccountId,
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
        salePrice: 10,
        vatTreatment: 'STANDARD',
        defaultTaxRateId: taxRateId,
        trackInventory: true,
      },
    });
    itemId = item.id;
    const svc = await prisma.item.create({
      data: {
        companyId,
        code: `SV-${randomUUID().slice(0, 8)}`,
        name: 'Consulting',
        baseUomId: uom.id,
        priceCurrency: 'USD',
        salePrice: 50,
        vatTreatment: 'STANDARD',
        defaultTaxRateId: taxRateId,
        trackInventory: false,
      },
    });
    serviceItemId = svc.id;

    customerId = (
      await prisma.partner.create({
        data: {
          companyId,
          ref: 'CUST-1',
          name: 'Beirut Retail',
          isCustomer: true,
          receivableAccountId: arAccountId,
        },
      })
    ).id;

    internalLoc = (
      await prisma.location.create({
        data: { companyId, code: 'WH', name: 'Warehouse', type: 'INTERNAL' },
      })
    ).id;
    await prisma.location.create({
      data: { companyId, code: 'CUS', name: 'Customers', type: 'CUSTOMER' },
    });
    await prisma.location.create({
      data: { companyId, code: 'SUP', name: 'Suppliers', type: 'SUPPLIER' },
    });

    for (const docType of [
      DocumentType.SALES_INVOICE,
      DocumentType.CREDIT_NOTE,
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

    // Seed 5 units on hand at cost 4 (moving average) via an inbound receipt.
    const supplierLoc = await prisma.location.findFirstOrThrow({
      where: { companyId, type: 'SUPPLIER' },
    });
    await stock
      .createMovement(
        {
          type: StockMovementType.RECEIPT,
          movementDate: '2026-08-01',
          itemId,
          fromLocationId: supplierLoc.id,
          toLocationId: internalLoc,
          qty: 5,
          unitCost: 4,
          partnerId: customerId, // any partner is fine for the seed; role not checked for SUPPLIER→INTERNAL
          companyId,
        },
        { ...caller, isPlatformAdmin: true }, // platform-admin bypass so partner role check is skipped
      )
      .catch(async () => {
        // The SUPPLIER counterparty requires a supplier partner; make one and retry.
        const sup = await prisma.partner.create({
          data: { companyId, ref: 'SUP-1', name: 'Vendor', isSupplier: true },
        });
        await stock.createMovement(
          {
            type: StockMovementType.RECEIPT,
            movementDate: '2026-08-01',
            itemId,
            fromLocationId: supplierLoc.id,
            toLocationId: internalLoc,
            qty: 5,
            unitCost: 4,
            partnerId: sup.id,
            companyId,
          },
          caller,
        );
      });
  });

  afterAll(async () => {
    await prisma.journalLine.deleteMany({ where: { companyId } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.creditNoteLine.deleteMany({ where: { companyId } });
    await prisma.creditNote.deleteMany({ where: { companyId } });
    await prisma.salesInvoiceLine.deleteMany({ where: { companyId } });
    await prisma.salesInvoice.deleteMany({ where: { companyId } });
    await prisma.stockMovement.deleteMany({ where: { companyId } });
    await prisma.location.deleteMany({ where: { companyId } });
    await prisma.partner.deleteMany({ where: { companyId } });
    await prisma.item.deleteMany({ where: { companyId } });
    await prisma.taxRate.deleteMany({ where: { companyId } });
    await prisma.account.deleteMany({ where: { companyId } });
    await prisma.documentSequence.deleteMany({ where: { companyId } });
    await prisma.uom.deleteMany({ where: { companyId } });
    await prisma.uomCategory.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  const jeLines = async (journalEntryId: string) => {
    const lines = await prisma.journalLine.findMany({
      where: { journalEntryId },
    });
    return lines.map((l) => ({
      label: acctOf.get(l.accountId) ?? l.accountId,
      side: l.side,
      base: Number(l.amountBase),
      baseCurrencyCode: l.baseCurrencyCode,
    }));
  };

  it('confirming a sales invoice posts AR/revenue/VAT + COGS/inventory, balanced, and relieves stock', async () => {
    const inv = await invoices.create(
      {
        customerId,
        locationId: internalLoc,
        currencyCode: 'USD',
        invoiceDate: '2026-08-06',
        lines: [{ itemId, qty: 2 }], // price defaults to 10; 11% VAT
      },
      caller,
    );
    expect(inv.status).toBe('DRAFT');
    expect(inv.subtotal).toBe(20);
    expect(inv.vatTotal).toBe(2.2);
    expect(inv.grandTotal).toBe(22.2);

    const posted = await invoices.confirm(inv.id, caller);
    expect(posted.status).toBe('POSTED');
    expect(posted.journalEntryId).toBeTruthy();
    expect(posted.cogsTotalBase).toBe(8); // 2 units × avg cost 4
    expect(posted.lines[0].costBase).toBe(4);
    expect(posted.lines[0].stockMovementId).toBeTruthy();

    const lines = await jeLines(posted.journalEntryId!);
    const by = (label: string, side: JournalSide) =>
      lines
        .filter((l) => l.label === label && l.side === side)
        .reduce((s, l) => s + l.base, 0);
    expect(by('AR', JournalSide.DEBIT)).toBe(22.2);
    expect(by('REV', JournalSide.CREDIT)).toBe(20);
    expect(by('VAT', JournalSide.CREDIT)).toBe(2.2);
    expect(by('COGS', JournalSide.DEBIT)).toBe(8);
    expect(by('INV', JournalSide.CREDIT)).toBe(8);
    // Balanced, and every line self-describes its base currency.
    const dr = lines
      .filter((l) => l.side === 'DEBIT')
      .reduce((s, l) => s + l.base, 0);
    const cr = lines
      .filter((l) => l.side === 'CREDIT')
      .reduce((s, l) => s + l.base, 0);
    expect(dr).toBeCloseTo(cr, 6);
    expect(lines.every((l) => l.baseCurrencyCode === 'USD')).toBe(true);

    const onHand = await stock.onHand(
      { itemId, locationId: internalLoc },
      caller,
    );
    expect(onHand.qty).toBe(3); // 5 − 2
  });

  it('a service (non-stock) line posts revenue + VAT only, no COGS/inventory', async () => {
    const inv = await invoices.create(
      {
        customerId,
        currencyCode: 'USD',
        invoiceDate: '2026-08-06',
        lines: [{ itemId: serviceItemId, qty: 1, unitPrice: 100 }],
      },
      caller,
    );
    const posted = await invoices.confirm(inv.id, caller);
    expect(posted.cogsTotalBase).toBe(0);
    const lines = await jeLines(posted.journalEntryId!);
    expect(lines.some((l) => l.label === 'COGS')).toBe(false);
    expect(lines.some((l) => l.label === 'INV')).toBe(false);
    expect(lines.find((l) => l.label === 'AR')!.base).toBe(111); // 100 + 11% VAT
  });

  it('a credit note reverses the accounting and restocks the goods', async () => {
    const before = await stock.onHand(
      { itemId, locationId: internalLoc },
      caller,
    );
    const cn = await creditNotes.create(
      {
        customerId,
        locationId: internalLoc,
        currencyCode: 'USD',
        creditNoteDate: '2026-08-06',
        reason: 'return',
        lines: [{ itemId, qty: 1, unitPrice: 10 }],
      },
      caller,
    );
    const posted = await creditNotes.confirm(cn.id, caller);
    expect(posted.status).toBe('POSTED');
    expect(posted.cogsTotalBase).toBe(4); // 1 × avg 4

    const lines = await jeLines(posted.journalEntryId!);
    const by = (label: string, side: JournalSide) =>
      lines
        .filter((l) => l.label === label && l.side === side)
        .reduce((s, l) => s + l.base, 0);
    // Reverse of a sale: revenue/VAT debited, AR credited, inventory debited, COGS credited.
    expect(by('REV', JournalSide.DEBIT)).toBe(10);
    expect(by('VAT', JournalSide.DEBIT)).toBe(1.1);
    expect(by('AR', JournalSide.CREDIT)).toBe(11.1);
    expect(by('INV', JournalSide.DEBIT)).toBe(4);
    expect(by('COGS', JournalSide.CREDIT)).toBe(4);

    const after = await stock.onHand(
      { itemId, locationId: internalLoc },
      caller,
    );
    expect(after.qty).toBe(before.qty + 1);
  });

  it('rejects deleting a posted invoice (immutable)', async () => {
    const inv = await invoices.create(
      {
        customerId,
        locationId: internalLoc,
        currencyCode: 'USD',
        invoiceDate: '2026-08-06',
        lines: [{ itemId, qty: 1 }],
      },
      caller,
    );
    const posted = await invoices.confirm(inv.id, caller);
    await expect(invoices.remove(posted.id, caller)).rejects.toMatchObject({
      response: { code: 'INVOICE_POSTED' },
    });
  });
});
