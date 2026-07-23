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
    const grouped = await this.prisma.journalLine.groupBy({
      by: ['side'],
      where: this.postedLineWhere(account.companyId, asOfDate, {
        accountId,
      }),
      _sum: { amountBase: true },
    });

    const { debit, credit } = this.splitSides(grouped);
    const balance = round2(debit - credit);
    const naturalBalance =
      account.normalBalance === NormalBalance.DEBIT
        ? balance
        : round2(-balance);

    const dto = new AccountBalanceResponseDto();
    dto.accountId = account.id;
    dto.accountNumber = account.number;
    dto.accountName = account.name;
    dto.normalBalance = account.normalBalance;
    dto.totalDebitBase = debit;
    dto.totalCreditBase = credit;
    dto.balance = balance;
    dto.naturalBalance = naturalBalance;
    dto.asOf = asOfDate.toISOString().slice(0, 10);
    return dto;
  }

  async trialBalance(
    caller: AuthenticatedUser,
    asOf?: string,
    branchId?: string,
    companyIdQuery?: string,
  ): Promise<TrialBalanceResponseDto> {
    const companyId = this.resolveCompanyId(companyIdQuery, caller);
    const asOfDate = this.parseAsOf(asOf);

    const grouped = await this.prisma.journalLine.groupBy({
      by: ['accountId', 'side'],
      where: this.postedLineWhere(companyId, asOfDate, {}, branchId),
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
      select: { id: true, number: true, name: true },
    });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const rows: TrialBalanceRowDto[] = [];
    let totalDebit = 0;
    let totalCredit = 0;
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
      totalDebit += row.debit;
      totalCredit += row.credit;
      rows.push(row);
    }
    rows.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

    const dto = new TrialBalanceResponseDto();
    dto.companyId = companyId;
    dto.asOf = asOfDate.toISOString().slice(0, 10);
    dto.currency = await this.getBaseCurrency(companyId);
    dto.rows = rows;
    dto.totalDebit = round2(totalDebit);
    dto.totalCredit = round2(totalCredit);
    dto.isBalanced = dto.totalDebit === dto.totalCredit;
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

  private splitSides(
    grouped: {
      side: JournalSide;
      _sum: { amountBase: Prisma.Decimal | null };
    }[],
  ): { debit: number; credit: number } {
    let debit = 0;
    let credit = 0;
    for (const g of grouped) {
      const amount = Number(g._sum.amountBase ?? 0);
      if (g.side === JournalSide.DEBIT) {
        debit += amount;
      } else {
        credit += amount;
      }
    }
    return { debit: round2(debit), credit: round2(credit) };
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
