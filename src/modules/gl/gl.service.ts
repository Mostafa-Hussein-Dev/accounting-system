import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JournalSide, JournalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import { buildMoney } from '../../common/money/money';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { QueryJournalEntriesDto } from './dto/query-journal-entries.dto';
import { JournalLineDto } from './dto/journal-line.dto';
import { JournalEntryResponseDto } from './dto/journal-entry-response.dto';

const ALLOWED_SORT_FIELDS = ['date', 'entryNumber', 'createdAt', 'updatedAt'];

// A journal entry always loaded with its lines — the shape the response DTO and
// the balance checks need.
const ENTRY_WITH_LINES = { lines: true } as const;
type EntryWithLines = Prisma.JournalEntryGetPayload<{
  include: typeof ENTRY_WITH_LINES;
}>;

// A validated, money-computed line ready to persist (companyId is added at write).
interface PreparedLine {
  lineNo: number;
  accountId: string;
  side: JournalSide;
  amountOriginal: number;
  currency: string;
  rate: number;
  amountBase: number;
  baseCurrencyCode: string;
  partnerId: string | null;
  description: string | null;
}

@Injectable()
export class GlService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Platform admin gets the bare client and targets a company via the DTO; a
   * company-scoped caller gets forTenant(companyId), which forces every read to
   * their own company. Same pattern as the other tenant-scoped services.
   */
  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) {
      return this.prisma;
    }
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  async create(
    dto: CreateJournalEntryDto,
    caller: AuthenticatedUser,
  ): Promise<JournalEntryResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const date = new Date(dto.date);
    if (dto.branchId) {
      await this.assertBranchExists(dto.branchId, companyId);
    }

    const lines = await this.prepareLines(companyId, date, dto.lines);
    this.assertBalanced(lines);

    const entry = await this.prisma.journalEntry.create({
      data: {
        companyId,
        branchId: dto.branchId ?? null,
        date,
        reference: dto.reference ?? null,
        description: dto.description ?? null,
        status: JournalStatus.DRAFT,
        createdById: caller.userId,
        lines: { create: lines.map((l) => ({ companyId, ...l })) },
      },
      include: ENTRY_WITH_LINES,
    });
    return JournalEntryResponseDto.fromEntity(entry);
  }

  async findAll(
    query: QueryJournalEntriesDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<JournalEntryResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'date';

    const where: Prisma.JournalEntryWhereInput = { deletedAt: null };
    if (query.status) {
      where.status = query.status;
    }
    if (query.companyId) {
      where.companyId = query.companyId;
    }
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) {
        where.date.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.date.lte = new Date(query.dateTo);
      }
    }
    if (query.accountId) {
      where.lines = { some: { accountId: query.accountId } };
    }

    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.JournalEntryOrderByWithRelationInput;
    const client = this.clientFor(caller);

    const [rows, total] = await this.prisma.$transaction([
      client.journalEntry.findMany({
        where,
        include: ENTRY_WITH_LINES,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      client.journalEntry.count({ where }),
    ]);

    return Paginated.of(
      rows.map(JournalEntryResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<JournalEntryResponseDto> {
    return JournalEntryResponseDto.fromEntity(await this.getOwned(id, caller));
  }

  async update(
    id: string,
    dto: UpdateJournalEntryDto,
    caller: AuthenticatedUser,
  ): Promise<JournalEntryResponseDto> {
    const existing = await this.getOwned(id, caller);
    this.assertDraft(existing);

    if (dto.branchId) {
      await this.assertBranchExists(dto.branchId, existing.companyId);
    }

    // Recompute lines only when the caller supplies a new set.
    const date = dto.date ? new Date(dto.date) : existing.date;
    let prepared: PreparedLine[] | null = null;
    if (dto.lines) {
      prepared = await this.prepareLines(existing.companyId, date, dto.lines);
      this.assertBalanced(prepared);
    }

    await this.prisma.$transaction(async (tx) => {
      if (prepared) {
        await tx.journalLine.deleteMany({ where: { journalEntryId: id } });
      }
      await tx.journalEntry.update({
        where: { id },
        data: {
          date: dto.date ? date : undefined,
          reference: dto.reference,
          description: dto.description,
          branchId: dto.branchId === undefined ? undefined : dto.branchId,
          ...(prepared
            ? {
                lines: {
                  create: prepared.map((l) => ({
                    companyId: existing.companyId,
                    ...l,
                  })),
                },
              }
            : {}),
        },
      });
    });

    return this.findOne(id, caller);
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    const existing = await this.getOwned(id, caller);
    this.assertDraft(existing);
    // A never-posted draft may be hard-deleted (docs/MODELS.md); lines cascade.
    await this.clientFor(caller).journalEntry.delete({ where: { id } });
  }

  // --- shared helpers (also used by PostingService via getOwned) ---

  /** Load an entry with its lines, scoped to the caller, or 404. */
  async getOwned(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<EntryWithLines> {
    const entry = await this.clientFor(caller).journalEntry.findFirst({
      where: { id, deletedAt: null },
      include: ENTRY_WITH_LINES,
    });
    if (!entry) {
      throw new NotFoundException({
        code: 'JOURNAL_ENTRY_NOT_FOUND',
        message: `Journal entry with id ${id} was not found.`,
        field: null,
      });
    }
    return entry;
  }

  assertDraft(entry: EntryWithLines): void {
    if (entry.status !== JournalStatus.DRAFT) {
      throw new ConflictException({
        code: 'JOURNAL_ENTRY_NOT_DRAFT',
        message: `Journal entry ${entry.entryNumber ?? entry.id} is posted and cannot be edited or deleted — reverse it instead.`,
        field: null,
      });
    }
  }

  /**
   * Validate every line against the company’s accounts and compute its base
   * amount SERVER-SIDE (invariant #3). Rejects postings to control accounts
   * (they front sub-ledgers), currency mismatches, and unknown accounts.
   */
  private async prepareLines(
    companyId: string,
    date: Date,
    lines: JournalLineDto[],
  ): Promise<PreparedLine[]> {
    const baseCurrency = await this.getBaseCurrency(companyId);
    const prepared: PreparedLine[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const account = await this.prisma.account.findFirst({
        where: { id: line.accountId, companyId, deletedAt: null },
      });
      if (!account) {
        throw new NotFoundException({
          code: 'ACCOUNT_NOT_FOUND',
          message: `Account ${line.accountId} was not found in this company.`,
          field: `lines[${i}].accountId`,
        });
      }
      if (!account.isActive) {
        throw new BadRequestException({
          code: 'ACCOUNT_INACTIVE',
          message: `Account ${account.number} is inactive and cannot be posted to.`,
          field: `lines[${i}].accountId`,
        });
      }
      // Subsidiary-ledger rule (Odoo-aligned): a control account (AR/AP/…) holds
      // per-partner balances, so a line posting to it MUST carry a partnerId.
      // Non-control lines may optionally carry one too. This replaces the old
      // blanket "control accounts are never postable" rule.
      if (account.isControl && !line.partnerId) {
        throw new BadRequestException({
          code: 'CONTROL_ACCOUNT_REQUIRES_PARTNER',
          message: `Account ${account.number} is a control account; a line posting to it must specify a partnerId (sub-ledger posting).`,
          field: `lines[${i}].partnerId`,
        });
      }
      if (line.partnerId) {
        await this.assertPartnerExists(line.partnerId, companyId, i);
      }
      if (
        account.currencyRestriction &&
        account.currencyRestriction !== line.currency
      ) {
        throw new BadRequestException({
          code: 'ACCOUNT_CURRENCY_MISMATCH',
          message: `Account ${account.number} only accepts ${account.currencyRestriction}, not ${line.currency}.`,
          field: `lines[${i}].currency`,
        });
      }
      await this.assertCurrencyExists(line.currency, i);

      const rate = await this.resolveRate(
        companyId,
        line.currency,
        baseCurrency,
        date,
        line.rate,
        i,
      );
      const money = buildMoney(
        line.amountOriginal,
        line.currency,
        rate,
        baseCurrency,
      );

      prepared.push({
        lineNo: i + 1,
        accountId: line.accountId,
        side: line.side,
        amountOriginal: money.amountOriginal,
        currency: money.currency,
        rate: money.rate,
        amountBase: money.amountBase,
        baseCurrencyCode: baseCurrency,
        partnerId: line.partnerId ?? null,
        description: line.description ?? null,
      });
    }
    return prepared;
  }

  /** Reject an entry whose base-currency debits do not equal its credits (#1). */
  private assertBalanced(lines: PreparedLine[]): void {
    const debit = round2(
      lines
        .filter((l) => l.side === JournalSide.DEBIT)
        .reduce((s, l) => s + l.amountBase, 0),
    );
    const credit = round2(
      lines
        .filter((l) => l.side === JournalSide.CREDIT)
        .reduce((s, l) => s + l.amountBase, 0),
    );
    if (debit !== credit) {
      throw new BadRequestException({
        code: 'JOURNAL_ENTRY_UNBALANCED',
        message: `Journal entry is not balanced: debits (${debit}) must equal credits (${credit}) in the base currency.`,
        field: 'lines',
      });
    }
    if (debit === 0) {
      throw new BadRequestException({
        code: 'JOURNAL_ENTRY_EMPTY',
        message: 'A journal entry must move a non-zero amount.',
        field: 'lines',
      });
    }
  }

  /**
   * Resolve the rate to use for a line (currency units per 1 USD). Base currency
   * is always 1; an explicit rate wins; otherwise the newest exchange rate in
   * force on the entry date is used, or the caller must supply one.
   */
  private async resolveRate(
    companyId: string,
    currency: string,
    baseCurrency: string,
    date: Date,
    providedRate: number | undefined,
    index: number,
  ): Promise<number> {
    if (currency === baseCurrency) {
      return 1;
    }
    if (providedRate !== undefined) {
      return providedRate;
    }
    const rate = await this.prisma.exchangeRate.findFirst({
      where: {
        companyId,
        currencyCode: currency,
        effectiveDate: { lte: date },
      },
      orderBy: [{ effectiveDate: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!rate) {
      throw new BadRequestException({
        code: 'JOURNAL_RATE_REQUIRED',
        message: `No exchange rate for ${currency} on or before ${date.toISOString().slice(0, 10)}; provide an explicit rate.`,
        field: `lines[${index}].rate`,
      });
    }
    return Number(rate.rate);
  }

  private async getBaseCurrency(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { baseCurrencyCode: true },
    });
    if (!company) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: `Company with id ${companyId} was not found.`,
        field: 'companyId',
      });
    }
    return company.baseCurrencyCode;
  }

  private async assertCurrencyExists(
    currency: string,
    index: number,
  ): Promise<void> {
    const found = await this.prisma.currency.findUnique({
      where: { code: currency },
    });
    if (!found) {
      throw new BadRequestException({
        code: 'CURRENCY_NOT_FOUND',
        message: `Currency ${currency} is not configured.`,
        field: `lines[${index}].currency`,
      });
    }
  }

  private async assertBranchExists(
    branchId: string,
    companyId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException({
        code: 'BRANCH_NOT_FOUND',
        message: `Branch ${branchId} was not found in this company.`,
        field: 'branchId',
      });
    }
  }

  private async assertPartnerExists(
    partnerId: string,
    companyId: string,
    lineIndex: number,
  ): Promise<void> {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!partner) {
      throw new NotFoundException({
        code: 'PARTNER_NOT_FOUND',
        message: `Partner ${partnerId} was not found in this company.`,
        field: `lines[${lineIndex}].partnerId`,
      });
    }
  }

  private resolveCompanyId(
    dtoCompanyId: string | undefined,
    caller: AuthenticatedUser,
  ): string {
    if (!isPlatformAdmin(caller)) {
      return caller.companyId as string;
    }
    if (!dtoCompanyId) {
      throw new BadRequestException({
        code: 'COMPANY_ID_REQUIRED',
        message:
          'A platform admin must specify companyId when creating a journal entry.',
        field: 'companyId',
      });
    }
    return dtoCompanyId;
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
