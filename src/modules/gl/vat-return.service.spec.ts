import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { JournalSide } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { LedgerService } from './ledger.service';

// FR-903 VAT return — real-DB integration test. Base currency USD.
// output VAT = net credit on 4427 (VAT_OUT); input VAT = net debit on 4426 (VAT_IN).
describe('VAT return (FR-903)', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let companyId: string;
  let caller: AuthenticatedUser;

  const acct: Record<string, string> = {};
  let entryNo = 0;

  async function mkAccount(
    number: string,
    name: string,
    accountClass: number,
    type: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE',
    normal: 'DEBIT' | 'CREDIT',
    controlType: 'VAT_OUT' | 'VAT_IN' | null,
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
        isControl: controlType != null,
        controlType,
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
        description: 'vat test',
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
        name: `VAT Co ${randomUUID().slice(0, 8)}`,
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

    await mkAccount('531', 'Clearing', 5, 'ASSET', 'DEBIT', null, 'CLEAR');
    await mkAccount('70', 'Revenue', 7, 'REVENUE', 'CREDIT', null, 'REV');
    await mkAccount('60', 'Expense', 6, 'EXPENSE', 'DEBIT', null, 'EXP');
    await mkAccount('4427', 'Output VAT', 4, 'LIABILITY', 'CREDIT', 'VAT_OUT', 'VATOUT'); // prettier-ignore
    await mkAccount(
      '4426',
      'Input VAT',
      4,
      'ASSET',
      'DEBIT',
      'VAT_IN',
      'VATIN',
    );

    const D = JournalSide.DEBIT;
    const C = JournalSide.CREDIT;
    // In-period (2026-08-15): sale output VAT 11, purchase input VAT 5, credit note −1.
    await postEntry('2026-08-15', 'USD', [
      { key: 'CLEAR', side: D, amt: 111 },
      { key: 'REV', side: C, amt: 100 },
      { key: 'VATOUT', side: C, amt: 11 },
    ]);
    await postEntry('2026-08-15', 'USD', [
      { key: 'EXP', side: D, amt: 100 },
      { key: 'VATIN', side: D, amt: 5 },
      { key: 'CLEAR', side: C, amt: 105 },
    ]);
    await postEntry('2026-08-16', 'USD', [
      { key: 'VATOUT', side: D, amt: 1 }, // credit note reduces output VAT
      { key: 'CLEAR', side: C, amt: 1 },
    ]);
    // OUT of period (2026-06-15): must be excluded.
    await postEntry('2026-06-15', 'USD', [
      { key: 'CLEAR', side: D, amt: 111 },
      { key: 'REV', side: C, amt: 100 },
      { key: 'VATOUT', side: C, amt: 11 },
    ]);
  });

  it('nets output − input for the period, excluding out-of-period entries', async () => {
    const r = await ledger.vatReturn(caller, '2026-07-01', '2026-09-30');
    expect(r.currency).toBe('USD');
    expect(r.outputVat).toBe(10); // 11 − 1 (credit note); the June 11 excluded
    expect(r.inputVat).toBe(5);
    expect(r.netVat).toBe(5);
    expect(r.direction).toBe('PAYABLE');
    expect(r.byBaseCurrency).toBeNull();
  });

  it('rejects from > to', async () => {
    await expect(
      ledger.vatReturn(caller, '2026-09-30', '2026-07-01'),
    ).rejects.toMatchObject({ response: { code: 'VAT_RETURN_INVALID_RANGE' } });
  });

  it('returns NIL zeros for an empty period', async () => {
    const r = await ledger.vatReturn(caller, '2027-01-01', '2027-03-31');
    expect(r.outputVat).toBe(0);
    expect(r.inputVat).toBe(0);
    expect(r.netVat).toBe(0);
    expect(r.direction).toBe('NIL');
  });

  it('splits a mixed-base scope by currency; presentIn converts to one', async () => {
    // A second base currency (as if the company's base changed): LBP output VAT 500.
    await postEntry('2026-08-20', 'LBP', [
      { key: 'CLEAR', side: JournalSide.DEBIT, amt: 500 },
      { key: 'VATOUT', side: JournalSide.CREDIT, amt: 500 },
    ]);

    const mixed = await ledger.vatReturn(caller, '2026-07-01', '2026-09-30');
    expect(mixed.currency).toBeNull();
    expect(mixed.netVat).toBeNull();
    expect(mixed.byBaseCurrency).toHaveLength(2);
    const usd = mixed.byBaseCurrency!.find((g) => g.currency === 'USD')!;
    const lbp = mixed.byBaseCurrency!.find((g) => g.currency === 'LBP')!;
    expect(usd.netVat).toBe(5);
    expect(lbp.outputVat).toBe(500);

    // presentIn=USD needs an LBP rate (90000 LBP per USD).
    await prisma.exchangeRate.create({
      data: {
        companyId,
        currencyCode: 'LBP',
        rateType: 'Official',
        rate: 90000,
        effectiveDate: new Date('2026-01-01'),
      },
    });
    const presented = await ledger.vatReturn(
      caller,
      '2026-07-01',
      '2026-09-30',
      undefined,
      undefined,
      'USD',
    );
    expect(presented.presentation?.converted).toBe(true);
    expect(presented.currency).toBe('USD');
    // USD 10 + LBP 500/90000 ≈ 10.01 output VAT.
    expect(presented.outputVat).toBeCloseTo(10.01, 2);
    expect(presented.direction).toBe('PAYABLE');
  });
});
