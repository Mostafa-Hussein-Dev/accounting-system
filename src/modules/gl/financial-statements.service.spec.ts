import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { JournalSide } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { LedgerService } from './ledger.service';

// FR-905 Financial statements — real-DB integration test. Base currency USD.
describe('Financial statements (FR-905)', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let companyId: string;
  let caller: AuthenticatedUser;
  const acct: Record<string, string> = {};
  let entryNo = 0;

  const D = JournalSide.DEBIT;
  const C = JournalSide.CREDIT;

  async function mkAccount(
    number: string,
    name: string,
    accountClass: number,
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
    normal: 'DEBIT' | 'CREDIT',
    key: string,
  ): Promise<void> {
    const a = await prisma.account.create({
      data: {
        companyId,
        number,
        name,
        accountClass,
        type,
        normalBalance: normal,
      },
    });
    acct[key] = a.id;
  }

  async function postEntry(
    date: string,
    baseCurrency: string,
    lines: { key: string; side: JournalSide; amt: number }[],
  ): Promise<void> {
    await prisma.journalEntry.create({
      data: {
        companyId,
        entryNumber: `JE-T-${++entryNo}`,
        date: new Date(date),
        description: `entry ${entryNo}`,
        status: 'POSTED',
        postedAt: new Date(),
        createdById: caller.userId,
        lines: {
          createMany: {
            data: lines.map((l, i) => ({
              companyId,
              lineNo: i + 1,
              accountId: acct[l.key],
              side: l.side,
              amountOriginal: l.amt,
              currency: baseCurrency,
              rate: 1,
              amountBase: l.amt,
              baseCurrencyCode: baseCurrency,
            })),
          },
        },
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [LedgerService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    ledger = moduleRef.get(LedgerService);

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
        name: `FS Co ${randomUUID().slice(0, 8)}`,
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

    await mkAccount('531', 'Cash', 5, 'ASSET', 'DEBIT', 'CASH');
    await mkAccount('41', 'Customers', 4, 'ASSET', 'DEBIT', 'AR');
    await mkAccount('37', 'Inventory', 3, 'ASSET', 'DEBIT', 'INV');
    await mkAccount('40', 'Suppliers', 4, 'LIABILITY', 'CREDIT', 'AP');
    await mkAccount('101', 'Capital', 1, 'EQUITY', 'CREDIT', 'CAP');
    await mkAccount('70', 'Sales', 7, 'REVENUE', 'CREDIT', 'REV');
    await mkAccount('60', 'COGS', 6, 'EXPENSE', 'DEBIT', 'COGS');

    // E1 capital injection, E0 buy stock, E4 borrow, E2 sale, E3 cost of sale.
    await postEntry('2026-01-01', 'USD', [
      { key: 'CASH', side: D, amt: 1000 },
      { key: 'CAP', side: C, amt: 1000 },
    ]);
    await postEntry('2026-01-02', 'USD', [
      { key: 'INV', side: D, amt: 300 },
      { key: 'CASH', side: C, amt: 300 },
    ]);
    await postEntry('2026-01-03', 'USD', [
      { key: 'CASH', side: D, amt: 500 },
      { key: 'AP', side: C, amt: 500 },
    ]);
    await postEntry('2026-03-01', 'USD', [
      { key: 'AR', side: D, amt: 200 },
      { key: 'REV', side: C, amt: 200 },
    ]);
    await postEntry('2026-03-15', 'USD', [
      { key: 'COGS', side: D, amt: 120 },
      { key: 'INV', side: C, amt: 120 },
    ]);
    // After-period entry (2027): excluded from a 2026 statement.
    await postEntry('2027-01-01', 'USD', [
      { key: 'AR', side: D, amt: 999 },
      { key: 'REV', side: C, amt: 999 },
    ]);
  });

  it('income statement: revenue − expenses = net, excluding out-of-period', async () => {
    const r = await ledger.incomeStatement(caller, '2026-01-01', '2026-12-31');
    expect(r.currency).toBe('USD');
    expect(r.totalRevenue).toBe(200); // the 2027 sale of 999 is excluded
    expect(r.totalExpenses).toBe(120);
    expect(r.netResult).toBe(80);
    expect(r.revenue.find((l) => l.accountNumber === '70')?.amount).toBe(200);
  });

  it('income statement rollUp groups by PCL class', async () => {
    const r = await ledger.incomeStatement(caller, '2026-01-01', '2026-12-31', true); // prettier-ignore
    expect(r.rolledUp).toBe(true);
    expect(r.revenue).toEqual([
      {
        accountId: '',
        accountNumber: '7',
        accountName: 'Class 7',
        amount: 200,
      },
    ]);
    expect(r.expenses).toEqual([
      {
        accountId: '',
        accountNumber: '6',
        accountName: 'Class 6',
        amount: 120,
      },
    ]);
  });

  it('balance sheet balances: assets = liabilities + equity (incl. result)', async () => {
    const r = await ledger.balanceSheet(caller, '2026-12-31');
    expect(r.currency).toBe('USD');
    // Cash 1000−300+500=1200, AR 200, Inventory 300−120=180 → 1580.
    expect(r.totalAssets).toBe(1580);
    expect(r.totalLiabilities).toBe(500); // AP
    // Capital 1000 + result (200−120=80) = 1080.
    expect(r.totalEquity).toBe(1080);
    expect(r.isBalanced).toBe(true);
    expect(r.equity.find((l) => l.accountNumber === 'RESULT')?.amount).toBe(80);
  });

  it('general ledger: running balance, opening/closing, period bounds', async () => {
    const cash = await ledger.generalLedger(
      caller,
      acct.CASH,
      '2026-01-01',
      '2026-12-31',
    );
    expect(cash.currency).toBe('USD');
    expect(cash.openingBalance).toBe(0);
    expect(cash.totalDebit).toBe(1500); // 1000 + 500
    expect(cash.totalCredit).toBe(300);
    expect(cash.closingBalance).toBe(1200);
    expect(cash.rows[cash.rows.length - 1].runningBalance).toBe(1200);

    const rev = await ledger.generalLedger(
      caller,
      acct.REV,
      '2026-01-01',
      '2026-12-31',
    );
    expect(rev.totalCredit).toBe(200); // 2027 sale excluded
    expect(rev.closingBalance).toBe(-200);
  });

  it('rejects from > to', async () => {
    await expect(
      ledger.incomeStatement(caller, '2026-12-31', '2026-01-01'),
    ).rejects.toMatchObject({ response: { code: 'REPORT_INVALID_RANGE' } });
  });

  it('splits a mixed-base income statement; presentIn converts to one', async () => {
    // A second base currency: LBP revenue 900,000.
    await postEntry('2026-04-01', 'LBP', [
      { key: 'CASH', side: D, amt: 900000 },
      { key: 'REV', side: C, amt: 900000 },
    ]);
    const mixed = await ledger.incomeStatement(caller, '2026-01-01', '2026-12-31'); // prettier-ignore
    expect(mixed.currency).toBeNull();
    expect(mixed.netResult).toBeNull();
    expect(mixed.byBaseCurrency).toHaveLength(2);

    await prisma.exchangeRate.create({
      data: {
        companyId,
        currencyCode: 'LBP',
        rateType: 'Official',
        rate: 90000,
        effectiveDate: new Date('2026-01-01'),
      },
    });
    const presented = await ledger.incomeStatement(
      caller,
      '2026-01-01',
      '2026-12-31',
      false,
      undefined,
      undefined,
      'USD',
    );
    expect(presented.presentation?.converted).toBe(true);
    expect(presented.currency).toBe('USD');
    // USD revenue 200 + LBP 900000/90000 = 10 → 210.
    expect(presented.totalRevenue).toBeCloseTo(210, 2);
  });
});
