import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { JournalSide, PaymentDirection, PaymentMethod } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SequencesService } from '../sequences/sequences.service';
import { AuditService } from '../audit/audit.service';
import { GlService } from '../gl/gl.service';
import { LedgerService } from '../gl/ledger.service';
import { PostingService } from '../gl/posting.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PaymentsService } from './payments.service';

// FR-801 Cash & Payments — real-DB integration test (same style as invoicing).
// Base currency USD. Foreign-currency documents (LBP) exercise the FX line.
describe('Payments (FR-801) — receipts, supplier payments, allocation, FX', () => {
  let prisma: PrismaService;
  let payments: PaymentsService;
  let companyId: string;
  let caller: AuthenticatedUser;
  let customerId: string;
  let supplierId: string;
  let cashAccountId: string;
  let arAccountId: string;
  let apAccountId: string;

  const label = new Map<string, string>();

  const seqCounter = { n: 0 };
  const nextNo = (p: string): string => `${p}-${++seqCounter.n}`;

  async function mkAccount(
    number: string,
    name: string,
    accountClass: number,
    type: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE',
    normal: 'DEBIT' | 'CREDIT',
    controlType: 'AR' | 'AP' | 'CASH' | 'FX_GAIN' | 'FX_LOSS',
    tag: string,
  ): Promise<string> {
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
    label.set(a.id, tag);
    return a.id;
  }

  async function postInvoice(
    kind: 'sales' | 'purchase',
    partnerId: string,
    currencyCode: string,
    rate: number,
    grandTotal: number,
  ): Promise<string> {
    const base = {
      companyId,
      currencyCode,
      baseCurrencyCode: 'USD',
      rate,
      status: 'POSTED' as const,
      subtotal: grandTotal,
      grandTotal,
      subtotalBase: grandTotal / rate,
      grandTotalBase: grandTotal / rate,
    };
    if (kind === 'sales') {
      const inv = await prisma.salesInvoice.create({
        data: {
          ...base,
          invoiceNo: nextNo('INV'),
          customerId: partnerId,
          invoiceDate: new Date('2026-08-10'),
        },
      });
      return inv.id;
    }
    const bill = await prisma.vendorBill.create({
      data: {
        ...base,
        billNo: nextNo('BILL'),
        supplierId: partnerId,
        billDate: new Date('2026-08-10'),
      },
    });
    return bill.id;
  }

  async function linesOf(
    journalEntryId: string,
  ): Promise<{ tag: string; side: JournalSide; base: number }[]> {
    const rows = await prisma.journalLine.findMany({
      where: { journalEntryId },
      orderBy: { lineNo: 'asc' },
    });
    return rows.map((l) => ({
      tag: label.get(l.accountId) ?? l.accountId,
      side: l.side,
      base: Number(l.amountBase),
    }));
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [
        PaymentsService,
        SequencesService,
        AuditService,
        GlService,
        LedgerService,
        PostingService,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    payments = moduleRef.get(PaymentsService);

    for (const [code, name, symbol, dp] of [
      ['USD', 'US Dollar', '$', 2],
      ['LBP', 'Lebanese Pound', 'ل.ل', 0],
    ] as const) {
      await prisma.currency.upsert({
        where: { code },
        update: {},
        create: { code, name, symbol, decimalPlaces: dp },
      });
    }

    const company = await prisma.company.create({
      data: {
        name: `Pay Co ${randomUUID().slice(0, 8)}`,
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

    // Default sequences for PAYMENT_RECEIPT / SUPPLIER_PAYMENT / JOURNAL_ENTRY.
    const seq = moduleRef.get(SequencesService);
    await seq.applyDefaultSequences(companyId, prisma);

    arAccountId = await mkAccount('41', 'Customers', 4, 'ASSET', 'DEBIT', 'AR', 'AR'); // prettier-ignore
    apAccountId = await mkAccount('40', 'Suppliers', 4, 'LIABILITY', 'CREDIT', 'AP', 'AP'); // prettier-ignore
    cashAccountId = await mkAccount('531', 'Cash', 5, 'ASSET', 'DEBIT', 'CASH', 'CASH'); // prettier-ignore
    await mkAccount('775', 'FX gain', 7, 'REVENUE', 'CREDIT', 'FX_GAIN', 'FXG'); // prettier-ignore
    await mkAccount('675', 'FX loss', 6, 'EXPENSE', 'DEBIT', 'FX_LOSS', 'FXL'); // prettier-ignore

    const customer = await prisma.partner.create({
      data: {
        companyId,
        ref: `C-${randomUUID().slice(0, 8)}`,
        name: 'Acme Customer',
        isCustomer: true,
        isSupplier: false,
        receivableAccountId: arAccountId,
      },
    });
    customerId = customer.id;
    const supplier = await prisma.partner.create({
      data: {
        companyId,
        ref: `S-${randomUUID().slice(0, 8)}`,
        name: 'Globex Supplier',
        isCustomer: false,
        isSupplier: true,
        payableAccountId: apAccountId,
      },
    });
    supplierId = supplier.id;
  });

  it('customer receipt (base currency) clears an invoice with no FX line', async () => {
    const invId = await postInvoice('sales', customerId, 'USD', 1, 99.9);
    const p = await payments.create(
      {
        direction: PaymentDirection.IN,
        partnerId: customerId,
        cashAccountId,
        method: PaymentMethod.CASH,
        currencyCode: 'USD',
        amount: 99.9,
        paymentDate: '2026-08-14',
        allocations: [{ documentId: invId, amount: 99.9 }],
      },
      caller,
    );
    expect(p.status).toBe('POSTED');
    expect(p.paymentNo).toMatch(/^REC-/);
    expect(p.journalEntryId).toBeTruthy();
    expect(p.allocations).toHaveLength(1);

    const lines = await linesOf(p.journalEntryId as string);
    expect(lines).toEqual(
      expect.arrayContaining([
        { tag: 'CASH', side: JournalSide.DEBIT, base: 99.9 },
        { tag: 'AR', side: JournalSide.CREDIT, base: 99.9 },
      ]),
    );
    expect(lines.some((l) => l.tag === 'FXG' || l.tag === 'FXL')).toBe(false);

    const open = await payments.openItems(
      { partnerId: customerId, direction: PaymentDirection.IN },
      caller,
    );
    expect(open.find((o) => o.documentId === invId)).toBeUndefined();
  });

  it('on-account receipt (no allocation) credits AR at the payment rate', async () => {
    const p = await payments.create(
      {
        direction: PaymentDirection.IN,
        partnerId: customerId,
        cashAccountId,
        method: PaymentMethod.TRANSFER,
        currencyCode: 'USD',
        amount: 50,
        paymentDate: '2026-08-14',
      },
      caller,
    );
    const lines = await linesOf(p.journalEntryId as string);
    expect(lines).toEqual(
      expect.arrayContaining([
        { tag: 'CASH', side: JournalSide.DEBIT, base: 50 },
        { tag: 'AR', side: JournalSide.CREDIT, base: 50 },
      ]),
    );
    expect(p.allocations).toHaveLength(0);
  });

  it('foreign-currency receipt settled below the booked rate books an FX gain', async () => {
    // Invoice booked at 90000 LBP/USD → AR base = 100. Received at 80000 →
    // cash base = 112.5 → 12.5 more base value received = FX GAIN.
    const invId = await postInvoice(
      'sales',
      customerId,
      'LBP',
      90000,
      9_000_000,
    );
    const p = await payments.create(
      {
        direction: PaymentDirection.IN,
        partnerId: customerId,
        cashAccountId,
        method: PaymentMethod.CASH,
        currencyCode: 'LBP',
        rate: 80000,
        amount: 9_000_000,
        paymentDate: '2026-08-14',
        allocations: [{ documentId: invId, amount: 9_000_000 }],
      },
      caller,
    );
    const lines = await linesOf(p.journalEntryId as string);
    expect(lines).toEqual(
      expect.arrayContaining([
        { tag: 'CASH', side: JournalSide.DEBIT, base: 112.5 },
        { tag: 'AR', side: JournalSide.CREDIT, base: 100 },
        { tag: 'FXG', side: JournalSide.CREDIT, base: 12.5 },
      ]),
    );
    // Balanced: DR 112.5 == CR 100 + 12.5.
    const dr = lines.filter((l) => l.side === JournalSide.DEBIT).reduce((s, l) => s + l.base, 0); // prettier-ignore
    const cr = lines.filter((l) => l.side === JournalSide.CREDIT).reduce((s, l) => s + l.base, 0); // prettier-ignore
    expect(dr).toBeCloseTo(cr, 2);
  });

  it('supplier payment (base currency) debits AP and credits cash', async () => {
    const billId = await postInvoice('purchase', supplierId, 'USD', 1, 200);
    const p = await payments.create(
      {
        direction: PaymentDirection.OUT,
        partnerId: supplierId,
        cashAccountId,
        method: PaymentMethod.TRANSFER,
        currencyCode: 'USD',
        amount: 200,
        paymentDate: '2026-08-14',
        allocations: [{ documentId: billId, amount: 200 }],
      },
      caller,
    );
    expect(p.paymentNo).toMatch(/^PAY-/);
    const lines = await linesOf(p.journalEntryId as string);
    expect(lines).toEqual(
      expect.arrayContaining([
        { tag: 'AP', side: JournalSide.DEBIT, base: 200 },
        { tag: 'CASH', side: JournalSide.CREDIT, base: 200 },
      ]),
    );
  });

  it('rejects an allocation that exceeds the document open balance', async () => {
    const invId = await postInvoice('sales', customerId, 'USD', 1, 40);
    await expect(
      payments.create(
        {
          direction: PaymentDirection.IN,
          partnerId: customerId,
          cashAccountId,
          method: PaymentMethod.CASH,
          currencyCode: 'USD',
          amount: 60,
          paymentDate: '2026-08-14',
          allocations: [{ documentId: invId, amount: 60 }],
        },
        caller,
      ),
    ).rejects.toMatchObject({
      response: { code: 'ALLOCATION_EXCEEDS_BALANCE' },
    });
  });

  it('voiding a receipt reverses its entry and reopens the invoice', async () => {
    const invId = await postInvoice('sales', customerId, 'USD', 1, 30);
    const p = await payments.create(
      {
        direction: PaymentDirection.IN,
        partnerId: customerId,
        cashAccountId,
        method: PaymentMethod.CASH,
        currencyCode: 'USD',
        amount: 30,
        paymentDate: '2026-08-14',
        allocations: [{ documentId: invId, amount: 30 }],
      },
      caller,
    );
    const voided = await payments.void(p.id, caller);
    expect(voided.status).toBe('VOID');
    expect(voided.voidedAt).toBeTruthy();

    // A reversing journal entry now exists for the payment's entry.
    const reversal = await prisma.journalEntry.findFirst({
      where: { reversalOfId: p.journalEntryId as string },
    });
    expect(reversal).toBeTruthy();

    // Void excludes the allocation, so the invoice is open again.
    const open = await payments.openItems(
      { partnerId: customerId, direction: PaymentDirection.IN },
      caller,
    );
    expect(open.find((o) => o.documentId === invId)?.balanceOriginal).toBe(30);
  });
});
