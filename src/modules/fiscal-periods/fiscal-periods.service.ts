import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  AccountType,
  AuditAction,
  ControlType,
  DocumentType,
  FiscalPeriodStatus,
  JournalSide,
  JournalStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SequencesService } from '../sequences/sequences.service';
import { AuditService } from '../audit/audit.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CloseYearDto,
  CloseYearResultDto,
  ClosingEntryDto,
  FiscalPeriodResponseDto,
  PeriodRefDto,
  QueryFiscalPeriodsDto,
} from './dto/fiscal-period.dto';

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;
const toDecimal = (n: number): Prisma.Decimal => new Prisma.Decimal(n);

interface CloseLine {
  accountId: string;
  side: JournalSide;
  amount: number;
}

@Injectable()
export class FiscalPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequencesService,
    private readonly audit: AuditService,
  ) {}

  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) return this.prisma;
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  private resolveCompanyId(
    dtoCompanyId: string | undefined,
    caller: AuthenticatedUser,
  ): string {
    if (!isPlatformAdmin(caller)) {
      if (!caller.companyId) {
        throw new BadRequestException({
          code: 'COMPANY_CONTEXT_REQUIRED',
          message: 'No active company selected.',
          field: null,
        });
      }
      return caller.companyId;
    }
    if (!dtoCompanyId) {
      throw new BadRequestException({
        code: 'COMPANY_ID_REQUIRED',
        message: 'A platform admin must specify companyId.',
        field: 'companyId',
      });
    }
    return dtoCompanyId;
  }

  /**
   * The choke point every posting path calls (manual JEs via PostingService,
   * plus invoice/credit-note/vendor-bill/payment confirms). Rejects a posting
   * whose date falls in a LOCKED period. An absent period row = open. A DB
   * trigger backs this up for any path that slips through.
   */
  async assertOpen(
    companyId: string,
    date: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const locked = await tx.fiscalPeriod.findFirst({
      where: { companyId, year, month, status: FiscalPeriodStatus.LOCKED },
      select: { id: true },
    });
    if (locked) {
      throw new ConflictException({
        code: 'PERIOD_LOCKED',
        message: `Fiscal period ${year}-${String(month).padStart(2, '0')} is locked; posting into it is not allowed.`,
        field: null,
      });
    }
  }

  async list(
    query: QueryFiscalPeriodsDto,
    caller: AuthenticatedUser,
  ): Promise<FiscalPeriodResponseDto[]> {
    const companyId = this.resolveCompanyId(query.companyId, caller);
    const client = this.clientFor(caller);
    const rows = await client.fiscalPeriod.findMany({
      where: { companyId, ...(query.year ? { year: query.year } : {}) },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
    if (query.year) {
      const byMonth = new Map(rows.map((r) => [r.month, r]));
      return Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const r = byMonth.get(month);
        return {
          id: r?.id ?? null,
          year: query.year as number,
          month,
          status: r?.status ?? FiscalPeriodStatus.OPEN,
          lockedAt: r?.lockedAt ?? null,
        };
      });
    }
    return rows.map((r) => ({
      id: r.id,
      year: r.year,
      month: r.month,
      status: r.status,
      lockedAt: r.lockedAt,
    }));
  }

  async lock(
    dto: PeriodRefDto,
    caller: AuthenticatedUser,
  ): Promise<FiscalPeriodResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const client = this.clientFor(caller);
    const existing = await client.fiscalPeriod.findFirst({
      where: { companyId, year: dto.year, month: dto.month },
    });
    const row = existing
      ? await client.fiscalPeriod.update({
          where: { id: existing.id },
          data: {
            status: FiscalPeriodStatus.LOCKED,
            lockedAt: new Date(),
            lockedById: caller.userId,
          },
        })
      : await client.fiscalPeriod.create({
          data: {
            companyId,
            year: dto.year,
            month: dto.month,
            status: FiscalPeriodStatus.LOCKED,
            lockedAt: new Date(),
            lockedById: caller.userId,
          },
        });
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'FiscalPeriod',
      entityId: row.id,
      companyId,
      userId: caller.userId,
      after: { year: dto.year, month: dto.month, status: 'LOCKED' },
    });
    return this.toDto(row);
  }

  async unlock(
    dto: PeriodRefDto,
    caller: AuthenticatedUser,
  ): Promise<FiscalPeriodResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const client = this.clientFor(caller);
    const existing = await client.fiscalPeriod.findFirst({
      where: { companyId, year: dto.year, month: dto.month },
    });
    if (!existing || existing.status !== FiscalPeriodStatus.LOCKED) {
      throw new ConflictException({
        code: 'PERIOD_NOT_LOCKED',
        message: `Fiscal period ${dto.year}-${String(dto.month).padStart(2, '0')} is not locked.`,
        field: null,
      });
    }
    const row = await client.fiscalPeriod.update({
      where: { id: existing.id },
      data: {
        status: FiscalPeriodStatus.OPEN,
        lockedAt: null,
        lockedById: null,
      },
    });
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'FiscalPeriod',
      entityId: row.id,
      companyId,
      userId: caller.userId,
      before: { status: 'LOCKED' },
      after: { year: dto.year, month: dto.month, status: 'OPEN' },
    });
    return this.toDto(row);
  }

  async closeYear(
    dto: CloseYearDto,
    caller: AuthenticatedUser,
  ): Promise<CloseYearResultDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const { from, to, months } = await this.fiscalYearWindow(
      companyId,
      dto.year,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const already = await tx.journalEntry.findFirst({
        where: { companyId, reference: `CLOSE-${dto.year}`, deletedAt: null },
        select: { id: true },
      });
      if (already) {
        throw new ConflictException({
          code: 'YEAR_ALREADY_CLOSED',
          message: `Fiscal year ${dto.year} has already been closed; unlock and reverse the closing entry to redo it.`,
          field: null,
        });
      }

      const reAcc = await this.controlAccount(
        tx,
        companyId,
        ControlType.RETAINED_EARNINGS,
      );
      const plAccounts = await tx.account.findMany({
        where: {
          companyId,
          deletedAt: null,
          type: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
        },
        select: { id: true },
      });

      const closingEntries: ClosingEntryDto[] = [];
      if (plAccounts.length) {
        const grouped = await tx.journalLine.groupBy({
          by: ['accountId', 'side', 'baseCurrencyCode'],
          where: {
            companyId,
            accountId: { in: plAccounts.map((a) => a.id) },
            journalEntry: {
              status: JournalStatus.POSTED,
              deletedAt: null,
              date: { gte: from, lte: to },
            },
          },
          _sum: { amountBase: true },
        });

        // currency -> (accountId -> net debit(+)/credit(-))
        const byCurrency = new Map<string, Map<string, number>>();
        for (const g of grouped) {
          const per =
            byCurrency.get(g.baseCurrencyCode) ?? new Map<string, number>();
          const amt = Number(g._sum.amountBase ?? 0);
          per.set(
            g.accountId,
            (per.get(g.accountId) ?? 0) +
              (g.side === JournalSide.DEBIT ? amt : -amt),
          );
          byCurrency.set(g.baseCurrencyCode, per);
        }

        for (const [currency, per] of byCurrency) {
          const draft: CloseLine[] = [];
          for (const [accountId, netRaw] of per) {
            const net = round2(netRaw);
            if (net === 0) continue;
            // Post the opposite side to zero the account.
            draft.push({
              accountId,
              side: net > 0 ? JournalSide.CREDIT : JournalSide.DEBIT,
              amount: Math.abs(net),
            });
          }
          if (draft.length === 0) continue;
          const totalDebit = round2(
            draft
              .filter((l) => l.side === JournalSide.DEBIT)
              .reduce((s, l) => s + l.amount, 0),
          );
          const totalCredit = round2(
            draft
              .filter((l) => l.side === JournalSide.CREDIT)
              .reduce((s, l) => s + l.amount, 0),
          );
          // revenue (debit side here) − expenses (credit side) = net result.
          const netResult = round2(totalDebit - totalCredit);
          if (netResult > 0) {
            draft.push({
              accountId: reAcc.id,
              side: JournalSide.CREDIT,
              amount: netResult,
            });
          } else if (netResult < 0) {
            draft.push({
              accountId: reAcc.id,
              side: JournalSide.DEBIT,
              amount: -netResult,
            });
          }

          const entryNumber = await this.sequences.nextNumber(
            companyId,
            null,
            DocumentType.JOURNAL_ENTRY,
            to,
            tx,
          );
          let lineNo = 1;
          const entry = await tx.journalEntry.create({
            data: {
              companyId,
              entryNumber,
              date: to,
              reference: `CLOSE-${dto.year}`,
              description: `Year-end close ${dto.year} (${currency})`,
              status: JournalStatus.POSTED,
              postedAt: new Date(),
              postedById: caller.userId,
              createdById: caller.userId,
              lines: {
                createMany: {
                  data: draft.map((l) => ({
                    companyId,
                    lineNo: lineNo++,
                    accountId: l.accountId,
                    side: l.side,
                    amountOriginal: toDecimal(l.amount),
                    currency,
                    rate: toDecimal(1),
                    amountBase: toDecimal(l.amount),
                    baseCurrencyCode: currency,
                  })),
                },
              },
            },
          });
          closingEntries.push({
            currency,
            netResult,
            journalEntryId: entry.id,
          });
        }
      }

      // Lock every month of the fiscal year (after posting the close entry).
      for (const { year, month } of months) {
        const existing = await tx.fiscalPeriod.findFirst({
          where: { companyId, year, month },
        });
        if (existing) {
          if (existing.status !== FiscalPeriodStatus.LOCKED) {
            await tx.fiscalPeriod.update({
              where: { id: existing.id },
              data: {
                status: FiscalPeriodStatus.LOCKED,
                lockedAt: new Date(),
                lockedById: caller.userId,
              },
            });
          }
        } else {
          await tx.fiscalPeriod.create({
            data: {
              companyId,
              year,
              month,
              status: FiscalPeriodStatus.LOCKED,
              lockedAt: new Date(),
              lockedById: caller.userId,
            },
          });
        }
      }

      await this.audit.record(
        {
          action: AuditAction.POST,
          entity: 'FiscalPeriod',
          entityId: companyId,
          companyId,
          userId: caller.userId,
          after: {
            closedYear: dto.year,
            closingEntries: closingEntries.map((c) => ({
              currency: c.currency,
              netResult: c.netResult,
            })),
          },
        },
        tx,
      );

      return closingEntries;
    });

    return {
      companyId,
      year: dto.year,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      closingEntries: result,
      lockedMonths: months.map((m) => m.month),
    };
  }

  // --- helpers ---

  private toDto(r: {
    id: string;
    year: number;
    month: number;
    status: FiscalPeriodStatus;
    lockedAt: Date | null;
  }): FiscalPeriodResponseDto {
    return {
      id: r.id,
      year: r.year,
      month: r.month,
      status: r.status,
      lockedAt: r.lockedAt,
    };
  }

  private async fiscalYearWindow(
    companyId: string,
    year: number,
  ): Promise<{
    from: Date;
    to: Date;
    months: { year: number; month: number }[];
  }> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { fiscalYearStartMonth: true },
    });
    const startMonth = company.fiscalYearStartMonth ?? 1;
    const from = new Date(Date.UTC(year, startMonth - 1, 1));
    const nextStart = new Date(Date.UTC(year + 1, startMonth - 1, 1));
    const to = new Date(nextStart.getTime() - 24 * 3600 * 1000);
    const months: { year: number; month: number }[] = [];
    const cursor = new Date(from);
    for (let i = 0; i < 12; i++) {
      months.push({
        year: cursor.getUTCFullYear(),
        month: cursor.getUTCMonth() + 1,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return { from, to, months };
  }

  private async controlAccount(
    tx: Prisma.TransactionClient,
    companyId: string,
    controlType: ControlType,
  ) {
    const account = await tx.account.findFirst({
      where: { companyId, controlType, deletedAt: null },
    });
    if (!account) {
      throw new BadRequestException({
        code: `${controlType}_ACCOUNT_MISSING`,
        message: `No ${controlType} control account is configured for this company.`,
        field: null,
      });
    }
    return account;
  }
}
