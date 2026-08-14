import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  ControlType,
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
import {
  AccountBalanceResponseDto,
  BalancePresentationDto,
  PresentationRateDto,
} from './dto/account-balance-response.dto';
import {
  TrialBalanceResponseDto,
  TrialBalanceRowDto,
} from './dto/trial-balance-response.dto';
import {
  VatReturnCurrencyGroupDto,
  VatReturnPresentationDto,
  VatReturnResponseDto,
  vatDirection,
} from './dto/vat-return-response.dto';
import {
  GeneralLedgerCurrencyGroupDto,
  GeneralLedgerResponseDto,
  GeneralLedgerRowDto,
} from './dto/general-ledger-response.dto';
import {
  IncomeStatementCurrencyGroupDto,
  IncomeStatementResponseDto,
  StatementLineDto,
} from './dto/income-statement-response.dto';
import {
  BalanceSheetCurrencyGroupDto,
  BalanceSheetResponseDto,
} from './dto/balance-sheet-response.dto';

type AccountMeta = {
  number: string;
  name: string;
  accountClass: number;
  type: AccountType;
};
import {
  DEFAULT_RATE_TYPE,
  resolvePresentationRate,
} from '../../common/money/present-currency';

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
    presentIn?: string,
    rateType?: string,
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
      // Mixed base currency: never sum across them (docs/PROGRESS.md (base-currency)).
      dto.currency = null;
      dto.totalDebitBase = null;
      dto.totalCreditBase = null;
      dto.balance = null;
      dto.naturalBalance = null;
    }

    // Tier 2: present in a requested currency, converting each slice via the
    // rate in force (storage never moves; missing rate -> null figures).
    dto.presentation = presentIn
      ? await this.present(
          account.companyId,
          byBaseCurrency,
          presentIn,
          rateType,
          asOfDate,
          isDebitNormal,
        )
      : null;
    return dto;
  }

  /** Convert per-currency balance slices into a single presentation currency. */
  private async present(
    companyId: string,
    slices: {
      currency: string;
      totalDebitBase: number;
      totalCreditBase: number;
    }[],
    presentIn: string,
    rateType: string | undefined,
    asOfDate: Date,
    isDebitNormal: boolean,
  ): Promise<BalancePresentationDto> {
    const rt = rateType ?? DEFAULT_RATE_TYPE;
    const rates: PresentationRateDto[] = [];
    let debit = 0;
    let credit = 0;
    let ok = true;
    for (const s of slices) {
      const pr = await resolvePresentationRate(
        this.prisma,
        companyId,
        s.currency,
        presentIn,
        asOfDate,
        rt,
      );
      if (!pr) {
        ok = false;
        continue;
      }
      rates.push({
        from: s.currency,
        rate: pr.rate,
        rateType: pr.rateType,
        rateDate: pr.rateDate,
      });
      debit += s.totalDebitBase * pr.rate;
      credit += s.totalCreditBase * pr.rate;
    }
    const dp = await this.currencyDecimals(presentIn);
    const round = (n: number): number => {
      const f = 10 ** dp;
      return Math.round((n + Number.EPSILON) * f) / f;
    };
    const rawBalance = debit - credit;
    return {
      currency: presentIn,
      totalDebitBase: ok ? round(debit) : null,
      totalCreditBase: ok ? round(credit) : null,
      balance: ok ? round(rawBalance) : null,
      naturalBalance: ok
        ? round(isDebitNormal ? rawBalance : -rawBalance)
        : null,
      rates,
    };
  }

  private async currencyDecimals(code: string): Promise<number> {
    const cur = await this.prisma.currency.findUnique({
      where: { code },
      select: { decimalPlaces: true },
    });
    return cur?.decimalPlaces ?? 2;
  }

  async trialBalance(
    caller: AuthenticatedUser,
    asOf?: string,
    branchId?: string,
    companyIdQuery?: string,
    numberPrefix?: string[],
    rollUp?: boolean,
    presentIn?: string,
    rateType?: string,
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

    // Group by the STORED base currency as well, so figures are never summed
    // across currencies — a trial balance only balances WITHIN one currency
    // (docs/PROGRESS.md (base-currency)).
    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId', 'side', 'baseCurrencyCode'],
      where: this.postedLineWhere(
        companyId,
        asOfDate,
        accountIds ? { accountId: { in: accountIds } } : {},
        branchId,
      ),
      _sum: { amountBase: true },
    });

    // currency -> (accountId -> {debit, credit})
    const byCurrency = new Map<
      string,
      Map<string, { debit: number; credit: number }>
    >();
    const allAccountIds = new Set<string>();
    for (const g of grouped) {
      const perAccount =
        byCurrency.get(g.baseCurrencyCode) ??
        new Map<string, { debit: number; credit: number }>();
      const bucket = perAccount.get(g.accountId) ?? { debit: 0, credit: 0 };
      const amount = Number(g._sum.amountBase ?? 0);
      if (g.side === JournalSide.DEBIT) bucket.debit += amount;
      else bucket.credit += amount;
      perAccount.set(g.accountId, bucket);
      byCurrency.set(g.baseCurrencyCode, perAccount);
      allAccountIds.add(g.accountId);
    }

    const currencies = [...byCurrency.keys()];
    if (currencies.length === 0) {
      return this.emptyTrialBalance(companyId, asOfDate, !!rollUp);
    }

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: [...allAccountIds] } },
      select: { id: true, number: true, name: true, accountClass: true },
    });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const buildFlat = (
      map: Map<string, { debit: number; credit: number }>,
    ): {
      rows: TrialBalanceRowDto[];
      totalDebit: number;
      totalCredit: number;
      isBalanced: boolean;
    } => {
      const rows = rollUp
        ? this.rollUpRows(map, accountById, numberPrefix)
        : this.perAccountRows(map, accountById);
      const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
      const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));
      return {
        rows,
        totalDebit,
        totalCredit,
        isBalanced: totalDebit === totalCredit,
      };
    };

    const dto = new TrialBalanceResponseDto();
    dto.companyId = companyId;
    dto.asOf = asOfDate.toISOString().slice(0, 10);
    dto.rolledUp = !!rollUp;

    // Tier 2: convert every currency slice into one presentation currency so the
    // report reads as a single balancing trial balance.
    if (presentIn) {
      const conv = await this.convertToPresentation(
        companyId,
        byCurrency,
        presentIn,
        rateType,
        asOfDate,
      );
      dto.presentation = {
        currency: presentIn,
        converted: conv.ok,
        rates: conv.rates,
      };
      if (conv.ok) {
        const flat = buildFlat(conv.map);
        dto.currency = presentIn;
        dto.rows = flat.rows;
        dto.totalDebit = flat.totalDebit;
        dto.totalCredit = flat.totalCredit;
        dto.isBalanced = flat.isBalanced;
        dto.byBaseCurrency = null;
        return dto;
      }
      // A rate was missing -> fall through to the honest per-currency breakdown.
    } else {
      dto.presentation = null;
    }

    if (currencies.length === 1) {
      const flat = buildFlat(byCurrency.get(currencies[0])!);
      dto.currency = currencies[0];
      dto.rows = flat.rows;
      dto.totalDebit = flat.totalDebit;
      dto.totalCredit = flat.totalCredit;
      dto.isBalanced = flat.isBalanced;
      dto.byBaseCurrency = null;
      return dto;
    }

    // Mixed base currency, no usable presentIn: one balanced trial balance per
    // currency, never a summed-across-currencies scalar.
    const groups = currencies.sort().map((cur) => {
      const flat = buildFlat(byCurrency.get(cur)!);
      return {
        currency: cur,
        rows: flat.rows,
        totalDebit: flat.totalDebit,
        totalCredit: flat.totalCredit,
        isBalanced: flat.isBalanced,
      };
    });
    dto.currency = null;
    dto.rows = [];
    dto.totalDebit = null;
    dto.totalCredit = null;
    dto.byBaseCurrency = groups;
    dto.isBalanced = groups.every((g) => g.isBalanced);
    return dto;
  }

  /**
   * VAT return (FR-903): output VAT (on sales) − input VAT (on purchases) over a
   * period = net VAT payable/recoverable. Derived from posted journal lines on
   * the VAT_OUT / VAT_IN control accounts within [from, to] — credit notes,
   * reversals and voids net out automatically. Currency-aware (mirrors the trial
   * balance): grouped by stored base currency, never summed across them.
   */
  async vatReturn(
    caller: AuthenticatedUser,
    from: string,
    to: string,
    branchId?: string,
    companyIdQuery?: string,
    presentIn?: string,
    rateType?: string,
  ): Promise<VatReturnResponseDto> {
    const companyId = this.resolveCompanyId(companyIdQuery, caller);
    const fromDate = this.parseRequiredDate(from, 'from');
    const toDate = this.parseRequiredDate(to, 'to');
    if (fromDate > toDate) {
      throw new BadRequestException({
        code: 'VAT_RETURN_INVALID_RANGE',
        message: '`from` must be on or before `to`.',
        field: 'from',
      });
    }

    const dto = new VatReturnResponseDto();
    dto.companyId = companyId;
    dto.from = fromDate.toISOString().slice(0, 10);
    dto.to = toDate.toISOString().slice(0, 10);
    dto.byBaseCurrency = null;
    dto.presentation = null;

    // The VAT control accounts (output 4427 / input 4426).
    const vatAccounts = await this.prisma.account.findMany({
      where: {
        companyId,
        deletedAt: null,
        controlType: { in: [ControlType.VAT_OUT, ControlType.VAT_IN] },
      },
      select: { id: true, controlType: true },
    });
    if (vatAccounts.length === 0) {
      dto.currency = await this.getBaseCurrency(companyId);
      dto.outputVat = 0;
      dto.inputVat = 0;
      dto.netVat = 0;
      dto.direction = 'NIL';
      return dto;
    }
    const kindByAccount = new Map(
      vatAccounts.map((a) => [a.id, a.controlType]),
    );

    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId', 'side', 'baseCurrencyCode'],
      where: {
        companyId,
        accountId: { in: vatAccounts.map((a) => a.id) },
        journalEntry: {
          status: JournalStatus.POSTED,
          deletedAt: null,
          date: { gte: fromDate, lte: toDate },
          ...(branchId ? { branchId } : {}),
        },
      },
      _sum: { amountBase: true },
    });

    // currency -> { output, input }
    const perCurrency = new Map<string, { output: number; input: number }>();
    for (const g of grouped) {
      const kind = kindByAccount.get(g.accountId);
      const amt = Number(g._sum.amountBase ?? 0);
      const bucket = perCurrency.get(g.baseCurrencyCode) ?? {
        output: 0,
        input: 0,
      };
      if (kind === ControlType.VAT_OUT) {
        // Output VAT is credit-normal: sales credit it, credit notes debit it.
        bucket.output += g.side === JournalSide.CREDIT ? amt : -amt;
      } else {
        // Input VAT is debit-normal: purchases debit it.
        bucket.input += g.side === JournalSide.DEBIT ? amt : -amt;
      }
      perCurrency.set(g.baseCurrencyCode, bucket);
    }

    const groups: VatReturnCurrencyGroupDto[] = [...perCurrency.entries()]
      .map(([currency, { output, input }]) => {
        const outputVat = round2(output);
        const inputVat = round2(input);
        const netVat = round2(outputVat - inputVat);
        return {
          currency,
          outputVat,
          inputVat,
          netVat,
          direction: vatDirection(netVat),
        };
      })
      .sort((a, b) => a.currency.localeCompare(b.currency));

    // Tier 2: convert into one presentation currency.
    if (presentIn) {
      const conv = await this.convertVat(
        companyId,
        groups,
        presentIn,
        rateType,
        toDate,
      );
      dto.presentation = conv;
      if (conv.converted) {
        dto.currency = presentIn;
        dto.outputVat = conv.outputVat;
        dto.inputVat = conv.inputVat;
        dto.netVat = conv.netVat;
        dto.direction = conv.direction;
        return dto;
      }
      // A rate was missing → fall through to the honest per-currency breakdown.
    }

    if (groups.length === 0) {
      dto.currency = await this.getBaseCurrency(companyId);
      dto.outputVat = 0;
      dto.inputVat = 0;
      dto.netVat = 0;
      dto.direction = 'NIL';
      return dto;
    }
    if (groups.length === 1) {
      const g = groups[0];
      dto.currency = g.currency;
      dto.outputVat = g.outputVat;
      dto.inputVat = g.inputVat;
      dto.netVat = g.netVat;
      dto.direction = g.direction;
      return dto;
    }
    // Mixed base currency: one return per currency, never summed across them.
    dto.currency = null;
    dto.outputVat = null;
    dto.inputVat = null;
    dto.netVat = null;
    dto.direction = null;
    dto.byBaseCurrency = groups;
    return dto;
  }

  /** Convert per-currency VAT figures into one presentation currency; `converted`
   *  is false if any source currency lacked a rate. */
  private async convertVat(
    companyId: string,
    groups: VatReturnCurrencyGroupDto[],
    presentIn: string,
    rateType: string | undefined,
    asOfDate: Date,
  ): Promise<VatReturnPresentationDto> {
    const rt = rateType ?? DEFAULT_RATE_TYPE;
    const rates: PresentationRateDto[] = [];
    let output = 0;
    let input = 0;
    let ok = true;
    for (const g of groups) {
      let rate = 1;
      if (g.currency !== presentIn) {
        const pr = await resolvePresentationRate(
          this.prisma,
          companyId,
          g.currency,
          presentIn,
          asOfDate,
          rt,
        );
        if (!pr) {
          ok = false;
          continue;
        }
        rate = pr.rate;
        rates.push({
          from: g.currency,
          rate: pr.rate,
          rateType: pr.rateType,
          rateDate: pr.rateDate,
        });
      }
      output += g.outputVat * rate;
      input += g.inputVat * rate;
    }
    const dp = await this.currencyDecimals(presentIn);
    const round = (n: number): number => {
      const f = 10 ** dp;
      return Math.round((n + Number.EPSILON) * f) / f;
    };
    const outputVat = ok ? round(output) : null;
    const inputVat = ok ? round(input) : null;
    const netVat = ok ? round(output - input) : null;
    return {
      currency: presentIn,
      converted: ok,
      outputVat,
      inputVat,
      netVat,
      direction: netVat === null ? null : vatDirection(netVat),
      rates,
    };
  }

  /** Convert every per-currency, per-account slice into one presentation
   *  currency; `ok` is false if any source currency lacked a rate. */
  private async convertToPresentation(
    companyId: string,
    byCurrency: Map<string, Map<string, { debit: number; credit: number }>>,
    presentIn: string,
    rateType: string | undefined,
    asOfDate: Date,
  ): Promise<{
    ok: boolean;
    map: Map<string, { debit: number; credit: number }>;
    rates: PresentationRateDto[];
  }> {
    const rt = rateType ?? DEFAULT_RATE_TYPE;
    const map = new Map<string, { debit: number; credit: number }>();
    const rates: PresentationRateDto[] = [];
    let ok = true;
    for (const [currency, perAccount] of byCurrency) {
      let rate = 1;
      if (currency !== presentIn) {
        const pr = await resolvePresentationRate(
          this.prisma,
          companyId,
          currency,
          presentIn,
          asOfDate,
          rt,
        );
        if (!pr) {
          ok = false;
          continue;
        }
        rate = pr.rate;
        rates.push({
          from: currency,
          rate: pr.rate,
          rateType: pr.rateType,
          rateDate: pr.rateDate,
        });
      }
      for (const [accId, { debit, credit }] of perAccount) {
        const b = map.get(accId) ?? { debit: 0, credit: 0 };
        b.debit += debit * rate;
        b.credit += credit * rate;
        map.set(accId, b);
      }
    }
    return { ok, map, rates };
  }

  /**
   * Income statement / P&L (FR-905): revenue (class 7) − expenses (class 6) over
   * a period = net result. Currency-aware (mirrors the trial balance).
   */
  async incomeStatement(
    caller: AuthenticatedUser,
    from: string,
    to: string,
    rollUp?: boolean,
    branchId?: string,
    companyIdQuery?: string,
    presentIn?: string,
    rateType?: string,
  ): Promise<IncomeStatementResponseDto> {
    const companyId = this.resolveCompanyId(companyIdQuery, caller);
    const fromDate = this.parseRequiredDate(from, 'from');
    const toDate = this.parseRequiredDate(to, 'to');
    this.assertRange(fromDate, toDate);

    const dto = new IncomeStatementResponseDto();
    dto.companyId = companyId;
    dto.from = fromDate.toISOString().slice(0, 10);
    dto.to = toDate.toISOString().slice(0, 10);
    dto.rolledUp = !!rollUp;
    dto.revenue = [];
    dto.expenses = [];
    dto.byBaseCurrency = null;
    dto.presentation = null;

    const accounts = await this.prisma.account.findMany({
      where: {
        companyId,
        deletedAt: null,
        type: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
      },
      select: {
        id: true,
        number: true,
        name: true,
        accountClass: true,
        type: true,
      },
    });
    const accountById = new Map<string, AccountMeta>(
      accounts.map((a) => [a.id, a]),
    );

    const grouped = accounts.length
      ? await this.prisma.journalLine.groupBy({
          by: ['accountId', 'side', 'baseCurrencyCode'],
          where: this.periodLineWhere(
            companyId,
            fromDate,
            toDate,
            { accountId: { in: accounts.map((a) => a.id) } },
            branchId,
          ),
          _sum: { amountBase: true },
        })
      : [];
    const byCurrency = this.groupByCurrencyAccount(grouped);

    const assign = (g: IncomeStatementCurrencyGroupDto): void => {
      dto.revenue = g.revenue;
      dto.totalRevenue = g.totalRevenue;
      dto.expenses = g.expenses;
      dto.totalExpenses = g.totalExpenses;
      dto.netResult = g.netResult;
    };

    if (presentIn) {
      const conv = await this.convertToPresentation(
        companyId,
        byCurrency,
        presentIn,
        rateType,
        toDate,
      );
      dto.presentation = {
        currency: presentIn,
        converted: conv.ok,
        rates: conv.rates,
      };
      if (conv.ok) {
        dto.currency = presentIn;
        assign(this.buildIncomeGroup(presentIn, conv.map, accountById, rollUp));
        return dto;
      }
    }

    const currencies = [...byCurrency.keys()];
    if (currencies.length === 0) {
      dto.currency = await this.getBaseCurrency(companyId);
      dto.totalRevenue = 0;
      dto.totalExpenses = 0;
      dto.netResult = 0;
      return dto;
    }
    if (currencies.length === 1) {
      dto.currency = currencies[0];
      assign(
        this.buildIncomeGroup(
          currencies[0],
          byCurrency.get(currencies[0])!,
          accountById,
          rollUp,
        ),
      );
      return dto;
    }
    dto.currency = null;
    dto.totalRevenue = null;
    dto.totalExpenses = null;
    dto.netResult = null;
    dto.byBaseCurrency = currencies
      .sort()
      .map((c) =>
        this.buildIncomeGroup(c, byCurrency.get(c)!, accountById, rollUp),
      );
    return dto;
  }

  /**
   * Balance sheet (FR-905): assets vs liabilities + equity as of a date. The
   * cumulative result (revenue − expenses up to asOf) is folded into equity as a
   * "Result for the period" line so the sheet balances. Currency-aware.
   */
  async balanceSheet(
    caller: AuthenticatedUser,
    asOf?: string,
    rollUp?: boolean,
    branchId?: string,
    companyIdQuery?: string,
    presentIn?: string,
    rateType?: string,
  ): Promise<BalanceSheetResponseDto> {
    const companyId = this.resolveCompanyId(companyIdQuery, caller);
    const asOfDate = this.parseAsOf(asOf);

    const dto = new BalanceSheetResponseDto();
    dto.companyId = companyId;
    dto.asOf = asOfDate.toISOString().slice(0, 10);
    dto.rolledUp = !!rollUp;
    dto.assets = [];
    dto.liabilities = [];
    dto.equity = [];
    dto.isBalanced = true;
    dto.byBaseCurrency = null;
    dto.presentation = null;

    const accounts = await this.prisma.account.findMany({
      where: { companyId, deletedAt: null },
      select: {
        id: true,
        number: true,
        name: true,
        accountClass: true,
        type: true,
      },
    });
    const accountById = new Map<string, AccountMeta>(
      accounts.map((a) => [a.id, a]),
    );

    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId', 'side', 'baseCurrencyCode'],
      where: this.postedLineWhere(companyId, asOfDate, {}, branchId),
      _sum: { amountBase: true },
    });
    const byCurrency = this.groupByCurrencyAccount(grouped);

    const assign = (g: BalanceSheetCurrencyGroupDto): void => {
      dto.assets = g.assets;
      dto.totalAssets = g.totalAssets;
      dto.liabilities = g.liabilities;
      dto.totalLiabilities = g.totalLiabilities;
      dto.equity = g.equity;
      dto.totalEquity = g.totalEquity;
      dto.isBalanced = g.isBalanced;
    };

    if (presentIn) {
      const conv = await this.convertToPresentation(
        companyId,
        byCurrency,
        presentIn,
        rateType,
        asOfDate,
      );
      dto.presentation = {
        currency: presentIn,
        converted: conv.ok,
        rates: conv.rates,
      };
      if (conv.ok) {
        dto.currency = presentIn;
        assign(
          this.buildBalanceGroup(presentIn, conv.map, accountById, rollUp),
        );
        return dto;
      }
    }

    const currencies = [...byCurrency.keys()];
    if (currencies.length === 0) {
      dto.currency = await this.getBaseCurrency(companyId);
      dto.totalAssets = 0;
      dto.totalLiabilities = 0;
      dto.totalEquity = 0;
      dto.isBalanced = true;
      return dto;
    }
    if (currencies.length === 1) {
      dto.currency = currencies[0];
      assign(
        this.buildBalanceGroup(
          currencies[0],
          byCurrency.get(currencies[0])!,
          accountById,
          rollUp,
        ),
      );
      return dto;
    }
    const groups = currencies
      .sort()
      .map((c) =>
        this.buildBalanceGroup(c, byCurrency.get(c)!, accountById, rollUp),
      );
    dto.currency = null;
    dto.totalAssets = null;
    dto.totalLiabilities = null;
    dto.totalEquity = null;
    dto.byBaseCurrency = groups;
    dto.isBalanced = groups.every((g) => g.isBalanced);
    return dto;
  }

  /**
   * General ledger (FR-905): one account's posted lines over a period with a
   * running balance (opening → each line → closing). Currency-aware.
   */
  async generalLedger(
    caller: AuthenticatedUser,
    accountId: string,
    from: string,
    to: string,
    branchId?: string,
    companyIdQuery?: string,
    presentIn?: string,
    rateType?: string,
  ): Promise<GeneralLedgerResponseDto> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, deletedAt: null },
    });
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
    const companyId = account.companyId;
    const fromDate = this.parseRequiredDate(from, 'from');
    const toDate = this.parseRequiredDate(to, 'to');
    this.assertRange(fromDate, toDate);

    const branchFilter = branchId ? { branchId } : {};
    const openingGrouped = await this.prisma.journalLine.groupBy({
      by: ['baseCurrencyCode', 'side'],
      where: {
        companyId,
        accountId,
        journalEntry: {
          status: JournalStatus.POSTED,
          deletedAt: null,
          date: { lt: fromDate },
          ...branchFilter,
        },
      },
      _sum: { amountBase: true },
    });
    const openingByCur = new Map<string, number>();
    for (const g of openingGrouped) {
      const amt = Number(g._sum?.amountBase ?? 0);
      openingByCur.set(
        g.baseCurrencyCode,
        (openingByCur.get(g.baseCurrencyCode) ?? 0) +
          (g.side === JournalSide.DEBIT ? amt : -amt),
      );
    }

    const lines = await this.prisma.journalLine.findMany({
      where: {
        companyId,
        accountId,
        journalEntry: {
          status: JournalStatus.POSTED,
          deletedAt: null,
          date: { gte: fromDate, lte: toDate },
          ...branchFilter,
        },
      },
      select: {
        side: true,
        amountBase: true,
        baseCurrencyCode: true,
        partnerId: true,
        lineNo: true,
        journalEntry: {
          select: {
            date: true,
            entryNumber: true,
            description: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { date: 'asc' } },
        { journalEntry: { createdAt: 'asc' } },
        { lineNo: 'asc' },
      ],
    });
    type GlLine = (typeof lines)[number];
    const linesByCur = new Map<string, GlLine[]>();
    for (const l of lines) {
      const arr = linesByCur.get(l.baseCurrencyCode) ?? [];
      arr.push(l);
      linesByCur.set(l.baseCurrencyCode, arr);
    }

    const buildGroup = (cur: string): GeneralLedgerCurrencyGroupDto => {
      const opening = round2(openingByCur.get(cur) ?? 0);
      let running = opening;
      let totalDebit = 0;
      let totalCredit = 0;
      const rows: GeneralLedgerRowDto[] = (linesByCur.get(cur) ?? []).map(
        (l) => {
          const debit = l.side === JournalSide.DEBIT ? Number(l.amountBase) : 0;
          const credit =
            l.side === JournalSide.CREDIT ? Number(l.amountBase) : 0;
          running = round2(running + debit - credit);
          totalDebit = round2(totalDebit + debit);
          totalCredit = round2(totalCredit + credit);
          return {
            date: l.journalEntry.date.toISOString().slice(0, 10),
            entryNumber: l.journalEntry.entryNumber,
            description: l.journalEntry.description,
            debit,
            credit,
            runningBalance: running,
            partnerId: l.partnerId,
          };
        },
      );
      return {
        currency: cur,
        openingBalance: opening,
        rows,
        totalDebit,
        totalCredit,
        closingBalance: round2(opening + totalDebit - totalCredit),
      };
    };

    const dto = new GeneralLedgerResponseDto();
    dto.companyId = companyId;
    dto.accountId = account.id;
    dto.accountNumber = account.number;
    dto.accountName = account.name;
    dto.from = fromDate.toISOString().slice(0, 10);
    dto.to = toDate.toISOString().slice(0, 10);
    dto.rows = [];
    dto.byBaseCurrency = null;
    dto.presentation = null;

    if (presentIn) {
      const conv = await this.convertGeneralLedger(
        companyId,
        openingByCur,
        linesByCur,
        presentIn,
        rateType,
        toDate,
      );
      dto.presentation = {
        currency: presentIn,
        converted: conv.ok,
        rates: conv.rates,
      };
      if (conv.ok) {
        dto.currency = presentIn;
        dto.openingBalance = conv.openingBalance;
        dto.rows = conv.rows;
        dto.totalDebit = conv.totalDebit;
        dto.totalCredit = conv.totalCredit;
        dto.closingBalance = conv.closingBalance;
        return dto;
      }
    }

    const currencies = [
      ...new Set([...openingByCur.keys(), ...linesByCur.keys()]),
    ];
    if (currencies.length === 0) {
      dto.currency = await this.getBaseCurrency(companyId);
      dto.openingBalance = 0;
      dto.totalDebit = 0;
      dto.totalCredit = 0;
      dto.closingBalance = 0;
      return dto;
    }
    if (currencies.length === 1) {
      const g = buildGroup(currencies[0]);
      dto.currency = g.currency;
      dto.openingBalance = g.openingBalance;
      dto.rows = g.rows;
      dto.totalDebit = g.totalDebit;
      dto.totalCredit = g.totalCredit;
      dto.closingBalance = g.closingBalance;
      return dto;
    }
    dto.currency = null;
    dto.openingBalance = null;
    dto.totalDebit = null;
    dto.totalCredit = null;
    dto.closingBalance = null;
    dto.byBaseCurrency = currencies.sort().map(buildGroup);
    return dto;
  }

  // --- statement helpers ---

  private assertRange(from: Date, to: Date): void {
    if (from > to) {
      throw new BadRequestException({
        code: 'REPORT_INVALID_RANGE',
        message: '`from` must be on or before `to`.',
        field: 'from',
      });
    }
  }

  private periodLineWhere(
    companyId: string,
    from: Date,
    to: Date,
    extra: Prisma.JournalLineWhereInput,
    branchId?: string,
  ): Prisma.JournalLineWhereInput {
    return {
      companyId,
      ...extra,
      journalEntry: {
        status: JournalStatus.POSTED,
        deletedAt: null,
        date: { gte: from, lte: to },
        ...(branchId ? { branchId } : {}),
      },
    };
  }

  /** grouped rows → currency → (accountId → {debit, credit}). */
  private groupByCurrencyAccount(
    grouped: {
      accountId: string;
      side: JournalSide;
      baseCurrencyCode: string;
      _sum: { amountBase: Prisma.Decimal | null };
    }[],
  ): Map<string, Map<string, { debit: number; credit: number }>> {
    const byCurrency = new Map<
      string,
      Map<string, { debit: number; credit: number }>
    >();
    for (const g of grouped) {
      const perAccount =
        byCurrency.get(g.baseCurrencyCode) ??
        new Map<string, { debit: number; credit: number }>();
      const bucket = perAccount.get(g.accountId) ?? { debit: 0, credit: 0 };
      const amt = Number(g._sum.amountBase ?? 0);
      if (g.side === JournalSide.DEBIT) bucket.debit += amt;
      else bucket.credit += amt;
      perAccount.set(g.accountId, bucket);
      byCurrency.set(g.baseCurrencyCode, perAccount);
    }
    return byCurrency;
  }

  private accumLine(
    m: Map<string, StatementLineDto>,
    accId: string,
    a: AccountMeta,
    rollUp: boolean | undefined,
    amount: number,
  ): void {
    const key = rollUp ? `class-${a.accountClass}` : accId;
    const existing = m.get(key);
    if (existing) {
      existing.amount += amount;
      return;
    }
    m.set(key, {
      accountId: rollUp ? '' : accId,
      accountNumber: rollUp ? String(a.accountClass) : a.number,
      accountName: rollUp ? `Class ${a.accountClass}` : a.name,
      amount,
    });
  }

  private finalizeLines(m: Map<string, StatementLineDto>): StatementLineDto[] {
    return [...m.values()]
      .map((l) => ({ ...l, amount: round2(l.amount) }))
      .filter((l) => l.amount !== 0)
      .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
  }

  private buildIncomeGroup(
    currency: string,
    map: Map<string, { debit: number; credit: number }>,
    accountById: Map<string, AccountMeta>,
    rollUp?: boolean,
  ): IncomeStatementCurrencyGroupDto {
    const revenue = new Map<string, StatementLineDto>();
    const expenses = new Map<string, StatementLineDto>();
    for (const [accId, { debit, credit }] of map) {
      const a = accountById.get(accId);
      if (!a) continue;
      if (a.type === AccountType.REVENUE) {
        this.accumLine(revenue, accId, a, rollUp, credit - debit);
      } else if (a.type === AccountType.EXPENSE) {
        this.accumLine(expenses, accId, a, rollUp, debit - credit);
      }
    }
    const revenueLines = this.finalizeLines(revenue);
    const expenseLines = this.finalizeLines(expenses);
    const totalRevenue = round2(revenueLines.reduce((s, l) => s + l.amount, 0));
    const totalExpenses = round2(
      expenseLines.reduce((s, l) => s + l.amount, 0),
    );
    return {
      currency,
      revenue: revenueLines,
      totalRevenue,
      expenses: expenseLines,
      totalExpenses,
      netResult: round2(totalRevenue - totalExpenses),
    };
  }

  private buildBalanceGroup(
    currency: string,
    map: Map<string, { debit: number; credit: number }>,
    accountById: Map<string, AccountMeta>,
    rollUp?: boolean,
  ): BalanceSheetCurrencyGroupDto {
    const assets = new Map<string, StatementLineDto>();
    const liabilities = new Map<string, StatementLineDto>();
    const equity = new Map<string, StatementLineDto>();
    let result = 0;
    for (const [accId, { debit, credit }] of map) {
      const a = accountById.get(accId);
      if (!a) continue;
      const net = debit - credit;
      switch (a.type) {
        case AccountType.ASSET:
          this.accumLine(assets, accId, a, rollUp, net);
          break;
        case AccountType.LIABILITY:
          this.accumLine(liabilities, accId, a, rollUp, -net);
          break;
        case AccountType.EQUITY:
          this.accumLine(equity, accId, a, rollUp, -net);
          break;
        case AccountType.REVENUE:
          result += credit - debit;
          break;
        case AccountType.EXPENSE:
          result -= debit - credit;
          break;
      }
    }
    const assetLines = this.finalizeLines(assets);
    const liabilityLines = this.finalizeLines(liabilities);
    const equityLines = this.finalizeLines(equity);
    // The undistributed result of the period keeps the sheet balanced until a
    // year-end close (FR-904) rolls it into retained earnings.
    equityLines.push({
      accountId: '',
      accountNumber: 'RESULT',
      accountName: 'Result for the period',
      amount: round2(result),
    });
    const totalAssets = round2(assetLines.reduce((s, l) => s + l.amount, 0));
    const totalLiabilities = round2(
      liabilityLines.reduce((s, l) => s + l.amount, 0),
    );
    const totalEquity = round2(equityLines.reduce((s, l) => s + l.amount, 0));
    return {
      currency,
      assets: assetLines,
      totalAssets,
      liabilities: liabilityLines,
      totalLiabilities,
      equity: equityLines,
      totalEquity,
      isBalanced: totalAssets === round2(totalLiabilities + totalEquity),
    };
  }

  /** Convert a general ledger's opening + lines into one presentation currency,
   *  merging all source currencies into a single date-ordered running series. */
  private async convertGeneralLedger(
    companyId: string,
    openingByCur: Map<string, number>,
    linesByCur: Map<
      string,
      {
        side: JournalSide;
        amountBase: Prisma.Decimal;
        partnerId: string | null;
        journalEntry: {
          date: Date;
          entryNumber: string | null;
          description: string | null;
          createdAt: Date;
        };
      }[]
    >,
    presentIn: string,
    rateType: string | undefined,
    asOfDate: Date,
  ): Promise<{
    ok: boolean;
    rates: PresentationRateDto[];
    openingBalance: number | null;
    rows: GeneralLedgerRowDto[];
    totalDebit: number | null;
    totalCredit: number | null;
    closingBalance: number | null;
  }> {
    const rt = rateType ?? DEFAULT_RATE_TYPE;
    const currencies = new Set([...openingByCur.keys(), ...linesByCur.keys()]);
    const rateByCur = new Map<string, number>();
    const rates: PresentationRateDto[] = [];
    for (const cur of currencies) {
      if (cur === presentIn) {
        rateByCur.set(cur, 1);
        continue;
      }
      const pr = await resolvePresentationRate(
        this.prisma,
        companyId,
        cur,
        presentIn,
        asOfDate,
        rt,
      );
      if (!pr) {
        return {
          ok: false,
          rates,
          openingBalance: null,
          rows: [],
          totalDebit: null,
          totalCredit: null,
          closingBalance: null,
        };
      }
      rateByCur.set(cur, pr.rate);
      rates.push({
        from: cur,
        rate: pr.rate,
        rateType: pr.rateType,
        rateDate: pr.rateDate,
      });
    }

    let opening = 0;
    for (const [cur, val] of openingByCur)
      opening += val * (rateByCur.get(cur) ?? 1);

    const merged: {
      date: Date;
      createdAt: Date;
      entryNumber: string | null;
      description: string | null;
      debit: number;
      credit: number;
      partnerId: string | null;
    }[] = [];
    for (const [cur, arr] of linesByCur) {
      const rate = rateByCur.get(cur) ?? 1;
      for (const l of arr) {
        merged.push({
          date: l.journalEntry.date,
          createdAt: l.journalEntry.createdAt,
          entryNumber: l.journalEntry.entryNumber,
          description: l.journalEntry.description,
          debit: l.side === JournalSide.DEBIT ? Number(l.amountBase) * rate : 0,
          credit:
            l.side === JournalSide.CREDIT ? Number(l.amountBase) * rate : 0,
          partnerId: l.partnerId,
        });
      }
    }
    merged.sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const dp = await this.currencyDecimals(presentIn);
    const rnd = (n: number): number => {
      const f = 10 ** dp;
      return Math.round((n + Number.EPSILON) * f) / f;
    };
    let running = opening;
    let totalDebit = 0;
    let totalCredit = 0;
    const rows: GeneralLedgerRowDto[] = merged.map((m) => {
      running += m.debit - m.credit;
      totalDebit += m.debit;
      totalCredit += m.credit;
      return {
        date: m.date.toISOString().slice(0, 10),
        entryNumber: m.entryNumber,
        description: m.description,
        debit: rnd(m.debit),
        credit: rnd(m.credit),
        runningBalance: rnd(running),
        partnerId: m.partnerId,
      };
    });
    return {
      ok: true,
      rates,
      openingBalance: rnd(opening),
      rows,
      totalDebit: rnd(totalDebit),
      totalCredit: rnd(totalCredit),
      closingBalance: rnd(opening + totalDebit - totalCredit),
    };
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

  private parseRequiredDate(value: string, field: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `${field} "${value}" is not a valid date.`,
        field,
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
