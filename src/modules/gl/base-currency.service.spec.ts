import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { JournalSide, JournalStatus, NormalBalance } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { LedgerService } from './ledger.service';

// The URGENT regression: base-currency amounts must stay labelled with the
// currency they were POSTED in, even after Company.baseCurrencyCode changes.
describe('LedgerService — self-describing base currency (URGENT)', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let companyId: string;
  let caller: AuthenticatedUser;
  let accA: string;
  let accB: string;

  const postEntry = async (base: string, amount: number): Promise<void> => {
    await prisma.journalEntry.create({
      data: {
        companyId,
        entryNumber: `JE-${randomUUID().slice(0, 8)}`,
        date: new Date('2026-08-05'),
        status: JournalStatus.POSTED,
        postedAt: new Date(),
        lines: {
          create: [
            {
              companyId,
              lineNo: 1,
              accountId: accA,
              side: JournalSide.DEBIT,
              amountOriginal: amount,
              currency: base,
              rate: 1,
              amountBase: amount,
              baseCurrencyCode: base,
            },
            {
              companyId,
              lineNo: 2,
              accountId: accB,
              side: JournalSide.CREDIT,
              amountOriginal: amount,
              currency: base,
              rate: 1,
              amountBase: amount,
              baseCurrencyCode: base,
            },
          ],
        },
      },
    });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [LedgerService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    ledger = moduleRef.get(LedgerService);

    for (const [code, name, dp] of [
      ['USD', 'US Dollar', 2],
      ['LBP', 'Lebanese Pound', 0],
    ] as const) {
      await prisma.currency.upsert({
        where: { code },
        update: {},
        create: { code, name, symbol: code, decimalPlaces: dp },
      });
    }
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
    const mk = async (number: string): Promise<string> =>
      (
        await prisma.account.create({
          data: {
            companyId,
            number,
            name: number,
            accountClass: 4,
            type: 'ASSET',
            normalBalance: NormalBalance.DEBIT,
          },
        })
      ).id;
    accA = await mk('A100');
    accB = await mk('B100');
  });

  afterAll(async () => {
    await prisma.journalLine.deleteMany({ where: { companyId } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.exchangeRate.deleteMany({ where: { companyId } });
    await prisma.account.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('labels a balance with the posted base currency, and it survives a company base change', async () => {
    await postEntry('USD', 100); // 100 USD debit on A

    let bal = await ledger.accountBalance(accA, caller);
    expect(bal.currency).toBe('USD');
    expect(bal.balance).toBe(100);
    expect(bal.byBaseCurrency).toEqual([
      {
        currency: 'USD',
        totalDebitBase: 100,
        totalCreditBase: 0,
        balance: 100,
        naturalBalance: 100,
      },
    ]);

    // The incident: switch the company's base currency to LBP.
    await prisma.company.update({
      where: { id: companyId },
      data: { baseCurrencyCode: 'LBP' },
    });

    // The already-posted balance must STILL read 100 USD, not 100 LBP.
    bal = await ledger.accountBalance(accA, caller);
    expect(bal.currency).toBe('USD');
    expect(bal.balance).toBe(100);
  });

  it('does not sum across base currencies — reports a per-currency breakdown', async () => {
    // Company base is now LBP (from the previous test); post a new LBP entry.
    await postEntry('LBP', 50); // 50 LBP debit on A

    const bal = await ledger.accountBalance(accA, caller);
    // Mixed base: scalar totals are null, breakdown carries each currency.
    expect(bal.currency).toBeNull();
    expect(bal.balance).toBeNull();
    expect(bal.totalDebitBase).toBeNull();
    const byCode = Object.fromEntries(
      bal.byBaseCurrency.map((r) => [r.currency, r.balance]),
    );
    expect(byCode).toEqual({ USD: 100, LBP: 50 });
  });

  it('presents a balance in a requested currency using the rate in force (Tier 2)', async () => {
    await prisma.exchangeRate.create({
      data: {
        companyId,
        currencyCode: 'LBP',
        rateType: 'Official',
        effectiveDate: new Date('2020-01-01'),
        rate: 89500, // LBP per 1 USD
      },
    });
    // accA holds USD 100 + LBP 50 -> present in LBP: 100*89500 + 50 = 8,950,050.
    const bal = await ledger.accountBalance(accA, caller, undefined, 'LBP');
    expect(bal.presentation).not.toBeNull();
    expect(bal.presentation!.currency).toBe('LBP');
    expect(bal.presentation!.balance).toBe(8_950_050);
    expect(bal.presentation!.rates.map((r) => r.from).sort()).toEqual([
      'LBP',
      'USD',
    ]);
  });

  it('returns null presentation figures when a required rate is missing', async () => {
    const bal = await ledger.accountBalance(accA, caller, undefined, 'EUR');
    expect(bal.presentation!.currency).toBe('EUR');
    expect(bal.presentation!.balance).toBeNull();
  });
});
