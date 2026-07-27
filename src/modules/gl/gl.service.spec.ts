import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  ControlType,
  DocumentType,
  JournalSide,
  JournalStatus,
  NormalBalance,
  ResetPeriod,
} from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SequencesService } from '../sequences/sequences.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { GlService } from './gl.service';
import { PostingService } from './posting.service';
import { LedgerService } from './ledger.service';

// End-to-end against the real database (same style as companies.service.spec).
describe('GL engine (FR-901/FR-906)', () => {
  let prisma: PrismaService;
  let gl: GlService;
  let posting: PostingService;
  let ledger: LedgerService;

  let companyId: string;
  let cashId: string; // asset, debit-normal, non-control
  let salesId: string; // revenue, credit-normal
  let expenseId: string; // expense, debit-normal
  let controlId: string; // AR control account
  let caller: AuthenticatedUser;

  const usd = (accountId: string, side: JournalSide, amount: number) => ({
    accountId,
    side,
    amountOriginal: amount,
    currency: 'USD',
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [
        GlService,
        PostingService,
        LedgerService,
        SequencesService,
        AuditService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    gl = moduleRef.get(GlService);
    posting = moduleRef.get(PostingService);
    ledger = moduleRef.get(LedgerService);

    // Currencies (global reference data) must exist for the base-currency FK.
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
        name: `GL Co ${randomUUID().slice(0, 8)}`,
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

    const mkAccount = (
      number: string,
      name: string,
      type: AccountType,
      normalBalance: NormalBalance,
      accountClass: number,
      control?: ControlType,
    ) =>
      prisma.account
        .create({
          data: {
            companyId,
            number,
            name,
            accountClass,
            type,
            normalBalance,
            isControl: !!control,
            controlType: control ?? null,
          },
        })
        .then((a) => a.id);

    cashId = await mkAccount(
      '5310',
      'Cash on hand',
      AccountType.ASSET,
      NormalBalance.DEBIT,
      5,
    );
    salesId = await mkAccount(
      '7000',
      'Sales',
      AccountType.REVENUE,
      NormalBalance.CREDIT,
      7,
    );
    expenseId = await mkAccount(
      '6000',
      'Rent expense',
      AccountType.EXPENSE,
      NormalBalance.DEBIT,
      6,
    );
    controlId = await mkAccount(
      '4100',
      'Customers',
      AccountType.ASSET,
      NormalBalance.DEBIT,
      4,
      ControlType.AR,
    );

    await prisma.documentSequence.create({
      data: {
        companyId,
        docType: DocumentType.JOURNAL_ENTRY,
        prefix: 'JE-',
        resetPeriod: ResetPeriod.YEARLY,
        padWidth: 4,
        nextNumber: 1,
      },
    });
  });

  afterAll(async () => {
    // Delete entries (lines cascade); the balance triggers skip a vanished entry.
    await prisma.journalEntry.deleteMany({ where: { companyId } });
    await prisma.documentSequence.deleteMany({ where: { companyId } });
    await prisma.account.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('creates a balanced draft with no number and server-computed base amounts', async () => {
    const entry = await gl.create(
      {
        date: '2026-07-23',
        description: 'Cash sale',
        lines: [
          usd(cashId, JournalSide.DEBIT, 100),
          usd(salesId, JournalSide.CREDIT, 100),
        ],
      },
      caller,
    );

    expect(entry.status).toBe(JournalStatus.DRAFT);
    expect(entry.entryNumber).toBeNull();
    expect(entry.totalDebitBase).toBe(100);
    expect(entry.totalCreditBase).toBe(100);
    expect(entry.isBalanced).toBe(true);
    expect(entry.lines).toHaveLength(2);
    expect(entry.lines[0].amountBase).toBe(100);
  });

  it('rejects an unbalanced entry', async () => {
    await expect(
      gl.create(
        {
          date: '2026-07-23',
          lines: [
            usd(cashId, JournalSide.DEBIT, 100),
            usd(salesId, JournalSide.CREDIT, 90),
          ],
        },
        caller,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('computes the base amount of a foreign-currency line from its rate', async () => {
    const entry = await gl.create(
      {
        date: '2026-07-23',
        description: 'LBP cash sale',
        lines: [
          {
            accountId: cashId,
            side: JournalSide.DEBIT,
            amountOriginal: 8_950_000,
            currency: 'LBP',
            rate: 89_500, // LBP per 1 USD -> 100 USD base
          },
          usd(salesId, JournalSide.CREDIT, 100),
        ],
      },
      caller,
    );
    const lbpLine = entry.lines.find((l) => l.currency === 'LBP')!;
    expect(lbpLine.amountBase).toBe(100);
    expect(entry.isBalanced).toBe(true);
  });

  it('rejects posting to a control account', async () => {
    await expect(
      gl.create(
        {
          date: '2026-07-23',
          lines: [
            usd(controlId, JournalSide.DEBIT, 50),
            usd(salesId, JournalSide.CREDIT, 50),
          ],
        },
        caller,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('posts a draft: assigns a number and freezes it immutable', async () => {
    const draft = await gl.create(
      {
        date: '2026-07-23',
        lines: [
          usd(expenseId, JournalSide.DEBIT, 40),
          usd(cashId, JournalSide.CREDIT, 40),
        ],
      },
      caller,
    );

    const posted = await posting.post(draft.id, caller);
    expect(posted.status).toBe(JournalStatus.POSTED);
    expect(posted.entryNumber).toMatch(/^JE-2026-\d{4}$/);
    expect(posted.postedAt).not.toBeNull();

    // Immutable: no edit, no delete, no double-post.
    await expect(
      gl.update(draft.id, { description: 'x' }, caller),
    ).rejects.toThrow(ConflictException);
    await expect(gl.remove(draft.id, caller)).rejects.toThrow(
      ConflictException,
    );
    await expect(posting.post(draft.id, caller)).rejects.toThrow(
      ConflictException,
    );
  });

  it('reverses a posted entry with swapped sides that net to zero', async () => {
    const draft = await gl.create(
      {
        date: '2026-07-23',
        lines: [
          usd(expenseId, JournalSide.DEBIT, 25),
          usd(cashId, JournalSide.CREDIT, 25),
        ],
      },
      caller,
    );
    const posted = await posting.post(draft.id, caller);
    const reversal = await posting.reverse(posted.id, {}, caller);

    expect(reversal.status).toBe(JournalStatus.POSTED);
    expect(reversal.reversalOfId).toBe(posted.id);
    const revExpense = reversal.lines.find((l) => l.accountId === expenseId)!;
    expect(revExpense.side).toBe(JournalSide.CREDIT); // was debit
    expect(revExpense.amountBase).toBe(25);

    // Cannot reverse twice.
    await expect(posting.reverse(posted.id, {}, caller)).rejects.toThrow(
      ConflictException,
    );

    // Cannot reverse a draft (a genuinely unposted entry).
    const freshDraft = await gl.create(
      {
        date: '2026-07-23',
        lines: [
          usd(expenseId, JournalSide.DEBIT, 5),
          usd(cashId, JournalSide.CREDIT, 5),
        ],
      },
      caller,
    );
    await expect(posting.reverse(freshDraft.id, {}, caller)).rejects.toThrow(
      ConflictException,
    );
  });

  it('derives account balances from posted lines only, signed to the normal side', async () => {
    // Fresh isolated company so earlier tests do not perturb the numbers.
    const co = await prisma.company.create({
      data: {
        name: `Bal Co ${randomUUID().slice(0, 8)}`,
        baseCurrencyCode: 'USD',
      },
    });
    const c = {
      userId: randomUUID(),
      companyId: co.id,
      isPlatformAdmin: false,
      mustChangePassword: false,
    };
    const cash = await prisma.account.create({
      data: {
        companyId: co.id,
        number: '5310',
        name: 'Cash',
        accountClass: 5,
        type: AccountType.ASSET,
        normalBalance: NormalBalance.DEBIT,
      },
    });
    const sales = await prisma.account.create({
      data: {
        companyId: co.id,
        number: '7000',
        name: 'Sales',
        accountClass: 7,
        type: AccountType.REVENUE,
        normalBalance: NormalBalance.CREDIT,
      },
    });
    await prisma.documentSequence.create({
      data: {
        companyId: co.id,
        docType: DocumentType.JOURNAL_ENTRY,
        prefix: 'JE-',
        resetPeriod: ResetPeriod.YEARLY,
      },
    });

    // One posted (counts) + one draft (ignored).
    const posted = await gl.create(
      {
        date: '2026-07-23',
        lines: [
          {
            accountId: cash.id,
            side: JournalSide.DEBIT,
            amountOriginal: 100,
            currency: 'USD',
          },
          {
            accountId: sales.id,
            side: JournalSide.CREDIT,
            amountOriginal: 100,
            currency: 'USD',
          },
        ],
      },
      c,
    );
    await posting.post(posted.id, c);
    await gl.create(
      {
        date: '2026-07-23',
        lines: [
          {
            accountId: cash.id,
            side: JournalSide.DEBIT,
            amountOriginal: 999,
            currency: 'USD',
          },
          {
            accountId: sales.id,
            side: JournalSide.CREDIT,
            amountOriginal: 999,
            currency: 'USD',
          },
        ],
      },
      c,
    );

    const cashBal = await ledger.accountBalance(cash.id, c);
    expect(cashBal.balance).toBe(100); // debit − credit, draft excluded
    expect(cashBal.naturalBalance).toBe(100); // debit-normal

    const salesBal = await ledger.accountBalance(sales.id, c);
    expect(salesBal.balance).toBe(-100); // credited
    expect(salesBal.naturalBalance).toBe(100); // credit-normal reads positive

    const tb = await ledger.trialBalance(c);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebit).toBe(100);
    expect(tb.totalCredit).toBe(100);
    expect(tb.rows.find((r) => r.accountId === cash.id)?.debit).toBe(100);
    expect(tb.rows.find((r) => r.accountId === sales.id)?.credit).toBe(100);

    await prisma.journalEntry.deleteMany({ where: { companyId: co.id } });
    await prisma.documentSequence.deleteMany({ where: { companyId: co.id } });
    await prisma.account.deleteMany({ where: { companyId: co.id } });
    await prisma.company.deleteMany({ where: { id: co.id } });
  });

  it('scopes and rolls up the trial balance by numberPrefix / class', async () => {
    const co = await prisma.company.create({
      data: {
        name: `TB Co ${randomUUID().slice(0, 8)}`,
        baseCurrencyCode: 'USD',
      },
    });
    const c = {
      userId: randomUUID(),
      companyId: co.id,
      isPlatformAdmin: false,
      mustChangePassword: false,
    };
    const mk = (
      number: string,
      type: AccountType,
      nb: NormalBalance,
      cls: number,
    ) =>
      prisma.account
        .create({
          data: {
            companyId: co.id,
            number,
            name: `Acct ${number}`,
            accountClass: cls,
            type,
            normalBalance: nb,
          },
        })
        .then((a) => a.id);
    const exp1 = await mk('6001', AccountType.EXPENSE, NormalBalance.DEBIT, 6);
    const exp2 = await mk('6002', AccountType.EXPENSE, NormalBalance.DEBIT, 6);
    const rev = await mk('7000', AccountType.REVENUE, NormalBalance.CREDIT, 7);
    await prisma.documentSequence.create({
      data: {
        companyId: co.id,
        docType: DocumentType.JOURNAL_ENTRY,
        prefix: 'JE-',
        resetPeriod: ResetPeriod.YEARLY,
      },
    });

    const postEntry = async (debitAcct: string, amount: number) => {
      const e = await gl.create(
        {
          date: '2026-07-23',
          lines: [
            {
              accountId: debitAcct,
              side: JournalSide.DEBIT,
              amountOriginal: amount,
              currency: 'USD',
            },
            {
              accountId: rev,
              side: JournalSide.CREDIT,
              amountOriginal: amount,
              currency: 'USD',
            },
          ],
        },
        c,
      );
      await posting.post(e.id, c);
    };
    await postEntry(exp1, 100);
    await postEntry(exp2, 40);
    // Ledger now: 6001 D100, 6002 D40, 7000 C140.

    // Full TB balances, one row per account.
    const full = await ledger.trialBalance(c);
    expect(full.isBalanced).toBe(true);
    expect(full.rolledUp).toBe(false);
    expect(full.rows).toHaveLength(3);

    // Prefix-scoped section (class 6 only) — debits without the offsetting
    // credit, so it deliberately does NOT balance.
    const section = await ledger.trialBalance(
      c,
      undefined,
      undefined,
      undefined,
      ['60'],
    );
    expect(section.rows).toHaveLength(2);
    expect(section.totalDebit).toBe(140);
    expect(section.totalCredit).toBe(0);
    expect(section.isBalanced).toBe(false);

    // Roll up by prefix -> one summary line for the "60" subtree.
    const rolledPrefix = await ledger.trialBalance(
      c,
      undefined,
      undefined,
      undefined,
      ['60'],
      true,
    );
    expect(rolledPrefix.rolledUp).toBe(true);
    expect(rolledPrefix.rows).toHaveLength(1);
    expect(rolledPrefix.rows[0].accountNumber).toBe('60');
    expect(rolledPrefix.rows[0].debit).toBe(140);

    // Roll up with no prefix -> one line per class, balances overall.
    const rolledClass = await ledger.trialBalance(
      c,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );
    expect(rolledClass.rows).toHaveLength(2);
    expect(rolledClass.rows.find((r) => r.accountNumber === '6')?.debit).toBe(
      140,
    );
    expect(rolledClass.rows.find((r) => r.accountNumber === '7')?.credit).toBe(
      140,
    );
    expect(rolledClass.isBalanced).toBe(true);

    await prisma.journalEntry.deleteMany({ where: { companyId: co.id } });
    await prisma.documentSequence.deleteMany({ where: { companyId: co.id } });
    await prisma.account.deleteMany({ where: { companyId: co.id } });
    await prisma.company.deleteMany({ where: { id: co.id } });
  });

  it('404s on an unknown account balance', async () => {
    await expect(ledger.accountBalance(randomUUID(), caller)).rejects.toThrow(
      NotFoundException,
    );
  });
});
