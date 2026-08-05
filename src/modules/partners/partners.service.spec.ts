import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import {
  AccountType,
  ControlType,
  JournalSide,
  JournalStatus,
  NormalBalance,
  PartnerAddressType,
} from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PartnersService } from './partners.service';

// End-to-end against the real database (same style as gl.service.spec).
describe('PartnersService (FR-301)', () => {
  let prisma: PrismaService;
  let partners: PartnersService;
  let companyId: string;
  let arId: string;
  let apId: string;
  let revenueId: string;
  let caller: AuthenticatedUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [PartnersService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    partners = moduleRef.get(PartnersService);

    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    await prisma.currency.upsert({
      where: { code: 'LBP' },
      update: {},
      create: {
        code: 'LBP',
        name: 'Lebanese Pound',
        symbol: 'ل.ل',
        decimalPlaces: 0,
      },
    });

    const company = await prisma.company.create({
      data: {
        name: `Partner Co ${randomUUID().slice(0, 8)}`,
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

    const ar = await prisma.account.create({
      data: {
        companyId,
        number: '41',
        name: 'Customers',
        accountClass: 4,
        type: AccountType.ASSET,
        normalBalance: NormalBalance.DEBIT,
        isControl: true,
        controlType: ControlType.AR,
      },
    });
    const ap = await prisma.account.create({
      data: {
        companyId,
        number: '40',
        name: 'Suppliers',
        accountClass: 4,
        type: AccountType.LIABILITY,
        normalBalance: NormalBalance.CREDIT,
        isControl: true,
        controlType: ControlType.AP,
      },
    });
    const revenue = await prisma.account.create({
      data: {
        companyId,
        number: '70',
        name: 'Sales',
        accountClass: 7,
        type: AccountType.REVENUE,
        normalBalance: NormalBalance.CREDIT,
      },
    });
    arId = ar.id;
    apId = ap.id;
    revenueId = revenue.id;
  });

  afterAll(async () => {
    await prisma.journalLine.deleteMany({ where: { companyId } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.partnerAddress.deleteMany({
      where: { partner: { companyId } },
    });
    await prisma.partner.deleteMany({ where: { companyId } });
    await prisma.exchangeRate.deleteMany({ where: { companyId } });
    await prisma.account.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  // Post a balanced entry with the AR line (carrying partnerId) on `arSide`.
  const postAr = async (
    partnerId: string,
    date: string,
    arSide: JournalSide,
    amount: number,
  ): Promise<void> => {
    const otherSide =
      arSide === JournalSide.DEBIT ? JournalSide.CREDIT : JournalSide.DEBIT;
    await prisma.journalEntry.create({
      data: {
        companyId,
        entryNumber: `JE-${randomUUID().slice(0, 6)}`,
        date: new Date(date),
        status: JournalStatus.POSTED,
        postedAt: new Date(),
        createdById: caller.userId,
        lines: {
          create: [
            {
              companyId,
              lineNo: 1,
              accountId: arId,
              side: arSide,
              amountOriginal: amount,
              currency: 'USD',
              baseCurrencyCode: 'USD',
              rate: 1,
              amountBase: amount,
              partnerId,
            },
            {
              companyId,
              lineNo: 2,
              accountId: revenueId,
              side: otherSide,
              amountOriginal: amount,
              currency: 'USD',
              baseCurrencyCode: 'USD',
              rate: 1,
              amountBase: amount,
            },
          ],
        },
      },
    });
  };

  it('auto-numbers a customer ref as <AR number><counter> and defaults the receivable account', async () => {
    const a = await partners.create(
      { name: 'Customer A', isCustomer: true },
      caller,
    );
    const b = await partners.create(
      { name: 'Customer B', isCustomer: true },
      caller,
    );

    expect(a.ref).toBe('410001');
    expect(b.ref).toBe('410002');
    expect(a.receivableAccountId).toBe(arId);
    expect(a.payableAccountId).toBeNull();
    expect(a.isCustomer).toBe(true);
  });

  it('auto-numbers a supplier under the AP account and sets the payable account', async () => {
    const s = await partners.create(
      { name: 'Supplier X', isSupplier: true },
      caller,
    );
    expect(s.ref).toBe('400001');
    expect(s.payableAccountId).toBe(apId);
    expect(s.receivableAccountId).toBeNull();
  });

  it('uses the AR (41) prefix and both accounts for a customer-and-supplier partner', async () => {
    const both = await partners.create(
      { name: 'Both Co', isCustomer: true, isSupplier: true },
      caller,
    );
    expect(both.ref.startsWith('41')).toBe(true);
    expect(both.receivableAccountId).toBe(arId);
    expect(both.payableAccountId).toBe(apId);
  });

  it('honors a user-supplied ref and rejects a duplicate', async () => {
    const p = await partners.create(
      { name: 'Manual', isCustomer: true, ref: 'CUST-777' },
      caller,
    );
    expect(p.ref).toBe('CUST-777');
    await expect(
      partners.create(
        { name: 'Dup', isCustomer: true, ref: 'CUST-777' },
        caller,
      ),
    ).rejects.toMatchObject({
      response: { code: 'PARTNER_REF_ALREADY_EXISTS' },
    });
  });

  it('requires at least one role', async () => {
    await expect(
      partners.create({ name: 'Roleless' }, caller),
    ).rejects.toMatchObject({ response: { code: 'PARTNER_ROLE_REQUIRED' } });
  });

  it('stores addresses and makes the first the default when none is flagged', async () => {
    const p = await partners.create(
      {
        name: 'WithAddr',
        isCustomer: true,
        addresses: [
          { type: PartnerAddressType.BILLING, line1: 'Line 1' },
          { type: PartnerAddressType.SHIPPING, line1: 'Line 2' },
        ],
      },
      caller,
    );
    expect(p.addresses).toHaveLength(2);
    const defaults = p.addresses!.filter((a) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].line1).toBe('Line 1');
  });

  it('rejects more than one default address', async () => {
    await expect(
      partners.create(
        {
          name: 'BadAddr',
          isCustomer: true,
          addresses: [
            { type: PartnerAddressType.BILLING, line1: 'A', isDefault: true },
            { type: PartnerAddressType.SHIPPING, line1: 'B', isDefault: true },
          ],
        },
        caller,
      ),
    ).rejects.toMatchObject({
      response: { code: 'MULTIPLE_DEFAULT_ADDRESSES' },
    });
  });

  it('filters by role and search text', async () => {
    const customers = await partners.findAll(
      {
        page: 1,
        limit: 100,
        sortBy: 'ref',
        sortOrder: 'asc',
        isSupplier: false,
        isCustomer: true,
      },
      caller,
    );
    expect(customers.data.every((p) => p.isCustomer)).toBe(true);

    const byText = await partners.findAll(
      { page: 1, limit: 100, sortBy: 'ref', sortOrder: 'asc', q: 'Supplier X' },
      caller,
    );
    expect(byText.data.some((p) => p.name === 'Supplier X')).toBe(true);
  });

  it('replaces addresses on update and soft-deletes', async () => {
    const p = await partners.create(
      { name: 'ToEdit', isCustomer: true },
      caller,
    );
    const updated = await partners.update(
      p.id,
      { addresses: [{ type: PartnerAddressType.BILLING, line1: 'New only' }] },
      caller,
    );
    expect(updated.addresses).toHaveLength(1);
    expect(updated.addresses![0].line1).toBe('New only');

    await partners.remove(p.id, caller);
    await expect(partners.findOne(p.id, caller)).rejects.toMatchObject({
      response: { code: 'PARTNER_NOT_FOUND' },
    });
  });

  it('derives balance and transactions from posted journal lines carrying partnerId', async () => {
    const cust = await partners.create(
      { name: 'Ledger Cust', isCustomer: true },
      caller,
    );

    await prisma.journalEntry.create({
      data: {
        companyId,
        entryNumber: `JE-${randomUUID().slice(0, 6)}`,
        date: new Date('2026-03-01'),
        status: JournalStatus.POSTED,
        postedAt: new Date(),
        createdById: caller.userId,
        lines: {
          create: [
            {
              companyId,
              lineNo: 1,
              accountId: arId,
              side: JournalSide.DEBIT,
              amountOriginal: 100,
              currency: 'USD',
              baseCurrencyCode: 'USD',
              rate: 1,
              amountBase: 100,
              partnerId: cust.id,
            },
            {
              companyId,
              lineNo: 2,
              accountId: revenueId,
              side: JournalSide.CREDIT,
              amountOriginal: 100,
              currency: 'USD',
              baseCurrencyCode: 'USD',
              rate: 1,
              amountBase: 100,
            },
          ],
        },
      },
    });

    const bal = await partners.balance(cust.id, caller);
    expect(bal.balanceBase).toBe(100);
    expect(bal.totalDebitBase).toBe(100);
    expect(bal.byCurrency).toEqual([
      { currency: 'USD', debit: 100, credit: 0, net: 100 },
    ]);

    const tx = await partners.transactions(cust.id, caller, {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(tx.meta.total).toBe(1);
    expect(tx.data[0].amountBase).toBe(100);
    expect(tx.data[0].side).toBe(JournalSide.DEBIT);
  });

  it('produces a statement with opening balance, running balance, totals, and LBP conversion', async () => {
    const cust = await partners.create(
      { name: 'Statement Cust', isCustomer: true },
      caller,
    );
    await prisma.exchangeRate.create({
      data: {
        companyId,
        currencyCode: 'LBP',
        rateType: 'Official',
        effectiveDate: new Date('2026-01-01'),
        rate: 89500,
      },
    });
    // Before the window (opening): a 100 sale on 2026-01-15.
    await postAr(cust.id, '2026-01-15', JournalSide.DEBIT, 100);
    // In the window: a 250 sale, then a 50 payment (AR credit).
    await postAr(cust.id, '2026-03-01', JournalSide.DEBIT, 250);
    await postAr(cust.id, '2026-03-10', JournalSide.CREDIT, 50);

    const st = await partners.statement(cust.id, caller, {
      from: '2026-02-01',
      to: '2026-03-31',
    });

    expect(st.orientation).toBe('receivable');
    expect(st.openingBalanceBase).toBe(100);
    expect(st.rows).toHaveLength(2);
    expect(st.rows[0].runningBalanceBase).toBe(350); // 100 + 250
    expect(st.rows[1].runningBalanceBase).toBe(300); // 350 - 50
    expect(st.totalDebitBase).toBe(250);
    expect(st.totalCreditBase).toBe(50);
    expect(st.closingBalanceBase).toBe(300);
    // LBP conversion at 89500/USD.
    expect(st.conversion?.rate).toBe(89500);
    expect(st.openingBalanceDisplay).toBe(100 * 89500);
    expect(st.closingBalanceDisplay).toBe(300 * 89500);
  });

  it('returns null LBP columns when no exchange rate is on file', async () => {
    const cust = await partners.create(
      { name: 'No-Rate Cust', isCustomer: true },
      caller,
    );
    await postAr(cust.id, '2026-05-02', JournalSide.DEBIT, 40);
    const st = await partners.statement(cust.id, caller, {
      from: '2026-05-01',
      to: '2026-05-31',
      rateType: 'NonExistentType',
    });
    expect(st.conversion).toBeNull();
    expect(st.closingBalanceBase).toBe(40);
    expect(st.closingBalanceDisplay).toBeNull();
    expect(st.rows[0].runningBalanceDisplay).toBeNull();
  });
});
