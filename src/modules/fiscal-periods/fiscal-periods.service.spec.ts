import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { JournalSide } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SequencesService } from '../sequences/sequences.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FiscalPeriodsService } from './fiscal-periods.service';

// FR-904 Fiscal periods & close — real-DB integration test. Base currency USD.
describe('Fiscal periods & close (FR-904)', () => {
  let prisma: PrismaService;
  let service: FiscalPeriodsService;
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
    type: 'ASSET' | 'REVENUE' | 'EXPENSE' | 'EQUITY',
    normal: 'DEBIT' | 'CREDIT',
    controlType: 'RETAINED_EARNINGS' | null,
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
    lines: { key: string; side: JournalSide; amt: number }[],
    status: 'POSTED' | 'DRAFT' = 'POSTED',
  ): Promise<void> {
    await prisma.journalEntry.create({
      data: {
        companyId,
        entryNumber: `JE-T-${++entryNo}`,
        date: new Date(date),
        description: 'test',
        status,
        postedAt: status === 'POSTED' ? new Date() : null,
        createdById: caller.userId,
        lines: {
          createMany: {
            data: lines.map((l, i) => ({
              companyId,
              lineNo: i + 1,
              accountId: acct[l.key],
              side: l.side,
              amountOriginal: l.amt,
              currency: 'USD',
              rate: 1,
              amountBase: l.amt,
              baseCurrencyCode: 'USD',
            })),
          },
        },
      },
    });
  }

  async function accountNet(key: string, year?: number): Promise<number> {
    const rows = await prisma.journalLine.groupBy({
      by: ['side'],
      where: {
        accountId: acct[key],
        journalEntry: {
          status: 'POSTED',
          ...(year
            ? {
                date: {
                  gte: new Date(`${year}-01-01`),
                  lte: new Date(`${year}-12-31`),
                },
              }
            : {}),
        },
      },
      _sum: { amountBase: true },
    });
    let net = 0;
    for (const r of rows) {
      const amt = Number(r._sum.amountBase ?? 0);
      net += r.side === D ? amt : -amt;
    }
    return net;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [FiscalPeriodsService, SequencesService, AuditService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(FiscalPeriodsService);

    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    const company = await prisma.company.create({
      data: {
        name: `FP Co ${randomUUID().slice(0, 8)}`,
        baseCurrencyCode: 'USD',
        fiscalYearStartMonth: 1,
      },
    });
    companyId = company.id;
    caller = {
      userId: randomUUID(),
      companyId,
      isPlatformAdmin: false,
      mustChangePassword: false,
    };
    await moduleRef.get(SequencesService).applyDefaultSequences(companyId, prisma); // prettier-ignore

    await mkAccount('531', 'Cash', 5, 'ASSET', 'DEBIT', null, 'CASH');
    await mkAccount('70', 'Sales', 7, 'REVENUE', 'CREDIT', null, 'REV');
    await mkAccount('60', 'COGS', 6, 'EXPENSE', 'DEBIT', null, 'EXP');
    await mkAccount('121', 'Retained earnings', 1, 'EQUITY', 'CREDIT', 'RETAINED_EARNINGS', 'RE'); // prettier-ignore
  });

  it('assertOpen blocks a locked month and allows others', async () => {
    await service.lock({ year: 2026, month: 3 }, caller);
    await expect(
      service.assertOpen(companyId, new Date('2026-03-10'), prisma),
    ).rejects.toMatchObject({ response: { code: 'PERIOD_LOCKED' } });
    await expect(
      service.assertOpen(companyId, new Date('2026-04-10'), prisma),
    ).resolves.toBeUndefined();
  });

  it('DB trigger rejects a POSTED entry in a locked month, allows a draft', async () => {
    // March 2026 is locked from the previous test.
    await expect(
      postEntry('2026-03-15', [
        { key: 'CASH', side: D, amt: 10 },
        { key: 'REV', side: C, amt: 10 },
      ]),
    ).rejects.toThrow(/PERIOD_LOCKED/);
    // A draft is allowed (only POSTED entries are gated).
    await expect(
      postEntry(
        '2026-03-15',
        [
          { key: 'CASH', side: D, amt: 10 },
          { key: 'REV', side: C, amt: 10 },
        ],
        'DRAFT',
      ),
    ).resolves.toBeUndefined();
  });

  it('unlock re-opens a period; unlocking an open one is rejected', async () => {
    const unlocked = await service.unlock({ year: 2026, month: 3 }, caller);
    expect(unlocked.status).toBe('OPEN');
    await expect(
      postEntry('2026-03-16', [
        { key: 'CASH', side: D, amt: 10 },
        { key: 'REV', side: C, amt: 10 },
      ]),
    ).resolves.toBeUndefined();
    await expect(
      service.unlock({ year: 2026, month: 3 }, caller),
    ).rejects.toMatchObject({ response: { code: 'PERIOD_NOT_LOCKED' } });
  });

  it('list returns 12 months with lock status', async () => {
    await service.lock({ year: 2027, month: 5 }, caller);
    const months = await service.list({ year: 2027 }, caller);
    expect(months).toHaveLength(12);
    expect(months.find((m) => m.month === 5)?.status).toBe('LOCKED');
    expect(months.find((m) => m.month === 6)?.status).toBe('OPEN');
  });

  it('year-end close zeroes P&L into retained earnings and locks the year', async () => {
    // Revenue 200, expense 120 in fiscal year 2028 (net result 80).
    await postEntry('2028-06-15', [
      { key: 'CASH', side: D, amt: 200 },
      { key: 'REV', side: C, amt: 200 },
    ]);
    await postEntry('2028-06-20', [
      { key: 'EXP', side: D, amt: 120 },
      { key: 'CASH', side: C, amt: 120 },
    ]);
    expect(await accountNet('REV', 2028)).toBe(-200); // credit-heavy
    expect(await accountNet('EXP', 2028)).toBe(120);

    const res = await service.closeYear({ year: 2028 }, caller);
    expect(res.closingEntries).toHaveLength(1);
    expect(res.closingEntries[0].netResult).toBe(80);
    expect(res.from).toBe('2028-01-01');
    expect(res.to).toBe('2028-12-31');

    // The 2028 P&L is now flat; the result sits in retained earnings.
    expect(await accountNet('REV', 2028)).toBe(0);
    expect(await accountNet('EXP', 2028)).toBe(0);
    expect(await accountNet('RE')).toBe(-80); // credit balance 80 (profit)

    // The whole year is locked, and re-closing is rejected.
    const dec = await service.list({ year: 2028 }, caller);
    expect(dec.every((m) => m.status === 'LOCKED')).toBe(true);
    await expect(
      service.closeYear({ year: 2028 }, caller),
    ).rejects.toMatchObject({ response: { code: 'YEAR_ALREADY_CLOSED' } });
  });
});
