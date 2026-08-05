import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JournalSide,
  JournalStatus,
  NormalBalance,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { AccountBalanceResponseDto } from './dto/account-balance-response.dto';
import {
  TrialBalanceResponseDto,
  TrialBalanceRowDto,
} from './dto/trial-balance-response.dto';

/**
 * Read-side of the ledger (FR-905): account balances and the trial balance, both
 * DERIVED from posted journal lines (invariant #4) — never stored. Only POSTED,
 * non-deleted entries count toward a balance; drafts are invisible to the books.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async accountBalance(
    accountId: string,
    caller: AuthenticatedUser,
    asOf?: string,
  ): Promise<AccountBalanceResponseDto> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, deletedAt: null },
    });
    // Company-scoped callers may only see their own accounts; a missing account
    // and a cross-tenant one both read as "not found".
    if (
      !account ||
      (!isPlatformAdmin(caller) && account.companyId !== caller.companyId)
    ) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: `Account with id ${accountId} was not found.`,
        field: null,
      });
    }

    const asOfDate = this.parseAsOf(asOf);
    // Group by the STORED base currency so figures are never summed across
    // currencies and are labelled from the data, not the mutable setting.
    const grouped = await this.prisma.journalLine.groupBy({
      by: ['baseCurrencyCode', 'side'],
      where: this.postedLineWhere(account.companyId, asOfDate, {
        accountId,
      }),
      _sum: { amountBase: true },
    });

    const isDebitNormal = account.normalBalance === NormalBalance.DEBIT;
    const perCurrency = new Map<string, { debit: number; credit: number }>();
    for (const g of grouped) {
      const bucket = perCurrency.get(g.baseCurrencyCode) ?? {
        debit: 0,
        credit: 0,
      };
      const amt = Number(g._sum.amountBase ?? 0);
      if (g.side === JournalSide.DEBIT) bucket.debit += amt;
      else bucket.credit += amt;
      perCurrency.set(g.baseCurrencyCode, bucket);
    }
    const byBaseCurrency = [...perCurrency.entries()].map(
      ([currency, { debit, credit }]) => {
        const bal = round2(debit - credit);
        return {
          currency,
          totalDebitBase: round2(debit),
          totalCreditBase: round2(credit),
          balance: bal,
          naturalBalance: isDebitNormal ? bal : round2(-bal),
        };
      },
    );

    const dto = new AccountBalanceResponseDto();
    dto.accountId = account.id;
    dto.accountNumber = account.number;
    dto.accountName = account.name;
    dto.normalBalance = account.normalBalance;
    dto.asOf = asOfDate.toISOString().slice(0, 10);
    dto.byBaseCurrency = byBaseCurrency;

    if (byBaseCurrency.length === 1) {
      const r = byBaseCurrency[0];
      dto.currency = r.currency;
      dto.totalDebitBase = r.totalDebitBase;
      dto.totalCreditBase = r.totalCreditBase;
      dto.balance = r.balance;
      dto.naturalBalance = r.naturalBalance;
    } else if (byBaseCurrency.length === 0) {
      // No postings: nothing to mislabel, so the current setting is a safe label.
      dto.currency = await this.getBaseCurrency(account.companyId);
      dto.totalDebitBase = 0;
      dto.totalCreditBase = 0;
      dto.balance = 0;
      dto.naturalBalance = 0;
    } else {
      // Mixed base currency: never sum across them (docs/URGENT.md §6.3).
      dto.currency = null;
      dto.totalDebitBase = null;
      dto.totalCreditBase = null;
      dto.balance = null;
      dto.naturalBalance = null;
    }
    return dto;
  }

  async trialBalance(
    caller: AuthenticatedUser,
    asOf?: string,
    branchId?: string,
    companyIdQuery?: string,
    numberPrefix?: string[],
    rollUp?: boolean,
  ): Promise<TrialBalanceResponseDto> {
    const companyId = this.resolveCompanyId(companyIdQuery, caller);
    const asOfDate = this.parseAsOf(asOf);

    // When prefixes are given, resolve the matching accounts up front so the
    // aggregation (and later the roll-up grouping) is scoped to those sub-trees.
    let accountIds: string[] | undefined;
    if (numberPrefix?.length) {
      const matched = await this.prisma.account.findMany({
        where: {
          companyId,
          deletedAt: null,
          OR: numberPrefix.map((p) => ({ number: { startsWith: p } })),
        },
        select: { id: true },
      });
      accountIds = matched.map((a) => a.id);
      if (accountIds.length === 0) {
        return this.emptyTrialBalance(companyId, asOfDate, !!rollUp);
      }
    }

    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId', 'side'],
      where: this.postedLineWhere(
        companyId,
        asOfDate,
        accountIds ? { accountId: { in: accountIds } } : {},
        branchId,
      ),
      _sum: { amountBase: true },
    });

    // Fold the (accountId, side) rows into a debit/credit total per account.
    const perAccount = new Map<string, { debit: number; credit: number }>();
    for (const g of grouped) {
      const bucket = perAccount.get(g.accountId) ?? { debit: 0, credit: 0 };
      const amount = Number(g._sum.amountBase ?? 0);
      if (g.side === JournalSide.DEBIT) {
        bucket.debit += amount;
      } else {
        bucket.credit += amount;
      }
      perAccount.set(g.accountId, bucket);
    }

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: [...perAccount.keys()] } },
      select: { id: true, number: true, name: true, accountClass: true },
    });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const rows = rollUp
      ? this.rollUpRows(perAccount, accountById, numberPrefix)
      : this.perAccountRows(perAccount, accountById);

    const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));

    // Currency from the STORED base currency of the lines in scope: a single
    // code when uniform, null when the scope spans more than one base currency
    // (post a base-currency change) — in which case the rows should be read via
    // ?presentIn to convert to one currency (docs/URGENT.md).
    const baseCurrencies = await this.prisma.journalLine.groupBy({
      by: ['baseCurrencyCode'],
      where: this.postedLineWhere(
        companyId,
        asOfDate,
        accountIds ? { accountId: { in: accountIds } } : {},
        branchId,
      ),
    });

    const dto = new TrialBalanceResponseDto();
    dto.companyId = companyId;
    dto.asOf = asOfDate.toISOString().slice(0, 10);
    dto.currency =
      baseCurrencies.length === 1
        ? baseCurrencies[0].baseCurrencyCode
        : baseCurrencies.length === 0
          ? await this.getBaseCurrency(companyId)
          : null;
    dto.rolledUp = !!rollUp;
    dto.rows = rows;
    dto.totalDebit = totalDebit;
    dto.totalCredit = totalCredit;
    // A full trial balance always balances; a prefix-filtered section may not.
    dto.isBalanced = totalDebit === totalCredit;
    return dto;
  }

  /** One row per account, net placed in the debit or credit column. */
  private perAccountRows(
    perAccount: Map<string, { debit: number; credit: number }>,
    accountById: Map<
      string,
      { number: string; name: string; accountClass: number }
    >,
  ): TrialBalanceRowDto[] {
    const rows: TrialBalanceRowDto[] = [];
    for (const [accountId, sums] of perAccount) {
      const net = round2(sums.debit - sums.credit);
      if (net === 0) {
        continue; // fully offset accounts drop off the trial balance
      }
      const account = accountById.get(accountId);
      const row = new TrialBalanceRowDto();
      row.accountId = accountId;
      row.accountNumber = account?.number ?? '';
      row.accountName = account?.name ?? '';
      row.debit = net > 0 ? net : 0;
      row.credit = net < 0 ? round2(-net) : 0;
      rows.push(row);
    }
    return rows.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  }

  /**
   * One summary row per group: the supplied numberPrefix each account falls
   * under, or its PCL class when no prefixes are given. Each group's net
   * position is placed in the debit or credit column.
   */
  private rollUpRows(
    perAccount: Map<string, { debit: number; credit: number }>,
    accountById: Map<
      string,
      { number: string; name: string; accountClass: number }
    >,
    numberPrefix?: string[],
  ): TrialBalanceRowDto[] {
    const netByKey = new Map<string, number>();
    for (const [accountId, sums] of perAccount) {
      const account = accountById.get(accountId);
      if (!account) {
        continue;
      }
      const key = numberPrefix?.length
        ? (numberPrefix.find((p) => account.number.startsWith(p)) ??
          account.number)
        : String(account.accountClass);
      netByKey.set(key, (netByKey.get(key) ?? 0) + (sums.debit - sums.credit));
    }

    const rows: TrialBalanceRowDto[] = [];
    for (const [key, rawNet] of netByKey) {
      const net = round2(rawNet);
      if (net === 0) {
        continue;
      }
      const row = new TrialBalanceRowDto();
      row.accountId = '';
      row.accountNumber = key;
      row.accountName = numberPrefix?.length
        ? `Accounts ${key}*`
        : `Class ${key}`;
      row.debit = net > 0 ? net : 0;
      row.credit = net < 0 ? round2(-net) : 0;
      rows.push(row);
    }
    return rows.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  }

  private async emptyTrialBalance(
    companyId: string,
    asOfDate: Date,
    rolledUp: boolean,
  ): Promise<TrialBalanceResponseDto> {
    const dto = new TrialBalanceResponseDto();
    dto.companyId = companyId;
    dto.asOf = asOfDate.toISOString().slice(0, 10);
    dto.currency = await this.getBaseCurrency(companyId);
    dto.rolledUp = rolledUp;
    dto.rows = [];
    dto.totalDebit = 0;
    dto.totalCredit = 0;
    dto.isBalanced = true;
    return dto;
  }

  // --- helpers ---

  /** Line filter for posted, non-deleted entries up to a date, optional branch. */
  private postedLineWhere(
    companyId: string,
    asOf: Date,
    extra: Prisma.JournalLineWhereInput,
    branchId?: string,
  ): Prisma.JournalLineWhereInput {
    return {
      companyId,
      ...extra,
      journalEntry: {
        status: JournalStatus.POSTED,
        deletedAt: null,
        date: { lte: asOf },
        ...(branchId ? { branchId } : {}),
      },
    };
  }

  private parseAsOf(asOf?: string): Date {
    if (!asOf) {
      return new Date();
    }
    const d = new Date(asOf);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_AS_OF_DATE',
        message: `asOf "${asOf}" is not a valid date.`,
        field: 'asOf',
      });
    }
    return d;
  }

  private async getBaseCurrency(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { baseCurrencyCode: true },
    });
    return company?.baseCurrencyCode ?? 'USD';
  }

  private resolveCompanyId(
    companyIdQuery: string | undefined,
    caller: AuthenticatedUser,
  ): string {
    if (!isPlatformAdmin(caller)) {
      return caller.companyId as string;
    }
    if (!companyIdQuery) {
      throw new BadRequestException({
        code: 'COMPANY_ID_QUERY_PARAM_REQUIRED',
        message:
          'A platform admin must specify companyId to run the trial balance.',
        field: 'companyId',
      });
    }
    return companyIdQuery;
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
