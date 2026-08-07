import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ControlType,
  JournalSide,
  JournalStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { resolvePresentationRate } from '../../common/money/present-currency';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { QueryPartnersDto } from './dto/query-partners.dto';
import { PartnerAddressDto } from './dto/partner-address.dto';
import { PartnerResponseDto } from './dto/partner-response.dto';
import {
  PartnerBalanceResponseDto,
  PartnerCurrencyBalanceDto,
  PartnerPresentationRateDto,
} from './dto/partner-balance-response.dto';
import { PartnerTransactionRowDto } from './dto/partner-transaction-response.dto';
import { QueryStatementDto } from './dto/query-statement.dto';
import {
  PartnerStatementResponseDto,
  StatementRowDto,
} from './dto/partner-statement-response.dto';

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const PRISMA_FOREIGN_KEY_CONSTRAINT = 'P2003';
const REF_PAD = 4;
const REF_MAX_RETRIES = 5;
const ALLOWED_SORT_FIELDS = ['ref', 'name', 'createdAt', 'updatedAt'];
const PARTNER_WITH_ADDRESSES = {
  addresses: { orderBy: { isDefault: 'desc' } },
} as const;

const round2 = (n: number): number => Math.round(n * 100) / 100;
// LBP carries 0 decimals (FR-103), so converted amounts are whole pounds.
const round0 = (n: number): number => Math.round(n);
const DEFAULT_RATE_TYPE = 'Official';
const DISPLAY_CURRENCY = 'LBP';

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Same tenant pattern as the other modules (accounts/GL). */
  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) {
      return this.prisma;
    }
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  async create(
    dto: CreatePartnerDto,
    caller: AuthenticatedUser,
  ): Promise<PartnerResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const isCustomer = dto.isCustomer ?? false;
    const isSupplier = dto.isSupplier ?? false;
    if (!isCustomer && !isSupplier) {
      throw new BadRequestException({
        code: 'PARTNER_ROLE_REQUIRED',
        message: 'A partner must be a customer, a supplier, or both.',
        field: 'isCustomer',
      });
    }

    if (dto.creditCurrency) {
      await this.assertCurrencyExists(dto.creditCurrency);
    }

    // Resolve the AR/AP accounts (default to the company control accounts) and
    // the prefix for auto-numbering (the account a customer/both rolls into, or
    // the payable account for a supplier-only partner).
    const { receivableAccountId, payableAccountId, prefix } =
      await this.resolveAccounts(companyId, isCustomer, isSupplier, {
        receivableAccountId: dto.receivableAccountId,
        payableAccountId: dto.payableAccountId,
      });

    const addresses = this.normalizeAddresses(dto.addresses);
    const client = this.clientFor(caller);

    const baseData = {
      companyId,
      name: dto.name,
      nameAr: dto.nameAr ?? null,
      nameFr: dto.nameFr ?? null,
      nameEn: dto.nameEn ?? null,
      isCustomer,
      isSupplier,
      category: dto.category ?? null,
      tin: dto.tin ?? null,
      contactName: dto.contactName ?? null,
      phone: dto.phone ?? null,
      phone2: dto.phone2 ?? null,
      email: dto.email ?? null,
      vip: dto.vip ?? false,
      creditLimit: dto.creditLimit ?? null,
      creditCurrency: dto.creditCurrency ?? null,
      receivableAccountId,
      payableAccountId,
      regionId: dto.regionId ?? null,
      salesmanId: dto.salesmanId ?? null,
      isActive: dto.isActive ?? true,
      ...(addresses ? { addresses: { create: addresses } } : {}),
    };

    // A user-supplied ref is used as-is (a collision is a hard error). A blank
    // ref auto-generates <prefix><counter>; the unique constraint guards races,
    // so on collision we regenerate and retry.
    for (let attempt = 0; attempt < REF_MAX_RETRIES; attempt++) {
      const ref =
        dto.ref ?? (await this.generateRef(client, companyId, prefix));
      try {
        const partner = await client.partner.create({
          data: { ...baseData, ref },
          include: PARTNER_WITH_ADDRESSES,
        });
        return PartnerResponseDto.fromEntity(partner);
      } catch (error) {
        if (this.isRefCollision(error)) {
          if (dto.ref) {
            throw new ConflictException({
              code: 'PARTNER_REF_ALREADY_EXISTS',
              message: `A partner with ref ${dto.ref} already exists in this company.`,
              field: 'ref',
            });
          }
          continue; // regenerate on the next loop
        }
        throw this.mapWriteError(error, companyId);
      }
    }
    throw new ConflictException({
      code: 'PARTNER_REF_GENERATION_FAILED',
      message: 'Could not allocate a unique partner ref; please retry.',
      field: null,
    });
  }

  async findAll(
    query: QueryPartnersDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<PartnerResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'ref';

    const where: Prisma.PartnerWhereInput = { deletedAt: null };
    if (query.companyId) {
      where.companyId = query.companyId;
    }
    if (query.isCustomer !== undefined) {
      where.isCustomer = query.isCustomer;
    }
    if (query.isSupplier !== undefined) {
      where.isSupplier = query.isSupplier;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.q) {
      where.OR = [
        { ref: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { tin: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const client = this.clientFor(caller);
    const [rows, total] = await this.prisma.$transaction([
      client.partner.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      client.partner.count({ where }),
    ]);

    return Paginated.of(
      rows.map(PartnerResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<PartnerResponseDto> {
    return PartnerResponseDto.fromEntity(await this.getOwned(id, caller));
  }

  async update(
    id: string,
    dto: UpdatePartnerDto,
    caller: AuthenticatedUser,
  ): Promise<PartnerResponseDto> {
    const existing = await this.getOwned(id, caller);

    const isCustomer = dto.isCustomer ?? existing.isCustomer;
    const isSupplier = dto.isSupplier ?? existing.isSupplier;
    if (!isCustomer && !isSupplier) {
      throw new BadRequestException({
        code: 'PARTNER_ROLE_REQUIRED',
        message: 'A partner must be a customer, a supplier, or both.',
        field: 'isCustomer',
      });
    }
    if (dto.creditCurrency) {
      await this.assertCurrencyExists(dto.creditCurrency);
    }

    // Keep the AR/AP accounts consistent: honor an explicit id, else keep the
    // existing one, else default when a role was just switched on.
    const { receivableAccountId, payableAccountId } =
      await this.resolveAccounts(existing.companyId, isCustomer, isSupplier, {
        receivableAccountId:
          dto.receivableAccountId ?? existing.receivableAccountId ?? undefined,
        payableAccountId:
          dto.payableAccountId ?? existing.payableAccountId ?? undefined,
      });

    const addresses =
      dto.addresses !== undefined
        ? this.normalizeAddresses(dto.addresses)
        : undefined;

    const data: Prisma.PartnerUncheckedUpdateInput = {
      ...(dto.ref !== undefined ? { ref: dto.ref } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
      ...(dto.nameFr !== undefined ? { nameFr: dto.nameFr } : {}),
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
      isCustomer,
      isSupplier,
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.tin !== undefined ? { tin: dto.tin } : {}),
      ...(dto.contactName !== undefined
        ? { contactName: dto.contactName }
        : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.phone2 !== undefined ? { phone2: dto.phone2 } : {}),
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.vip !== undefined ? { vip: dto.vip } : {}),
      ...(dto.creditLimit !== undefined
        ? { creditLimit: dto.creditLimit }
        : {}),
      ...(dto.creditCurrency !== undefined
        ? { creditCurrency: dto.creditCurrency }
        : {}),
      receivableAccountId,
      payableAccountId,
      ...(dto.regionId !== undefined ? { regionId: dto.regionId } : {}),
      ...(dto.salesmanId !== undefined ? { salesmanId: dto.salesmanId } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };

    try {
      // Ownership already checked, so operate by id in a plain transaction;
      // supplying addresses replaces the whole set.
      await this.prisma.$transaction(async (tx) => {
        await tx.partner.update({ where: { id }, data });
        if (addresses !== undefined) {
          await tx.partnerAddress.deleteMany({ where: { partnerId: id } });
          if (addresses.length > 0) {
            await tx.partnerAddress.createMany({
              data: addresses.map((a) => ({ ...a, partnerId: id })),
            });
          }
        }
      });
    } catch (error) {
      if (this.isRefCollision(error)) {
        throw new ConflictException({
          code: 'PARTNER_REF_ALREADY_EXISTS',
          message: `A partner with ref ${dto.ref} already exists in this company.`,
          field: 'ref',
        });
      }
      throw this.mapWriteError(error, existing.companyId);
    }

    return this.findOne(id, caller);
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.getOwned(id, caller);
    await this.clientFor(caller).partner.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async balance(
    id: string,
    caller: AuthenticatedUser,
    asOf?: string,
    presentIn?: string,
    rateType?: string,
  ): Promise<PartnerBalanceResponseDto> {
    const partner = await this.getOwned(id, caller);
    const asOfDate = this.parseAsOf(asOf);
    const entryFilter = {
      status: JournalStatus.POSTED,
      deletedAt: null,
      date: { lte: asOfDate },
    };
    const where: Prisma.JournalLineWhereInput = {
      partnerId: id,
      companyId: partner.companyId,
      journalEntry: entryFilter,
    };

    const [byBaseSide, byCurrencySide] = await this.prisma.$transaction([
      // Base figures grouped by the STORED base currency (never summed across).
      this.prisma.journalLine.groupBy({
        by: ['baseCurrencyCode', 'side'],
        where,
        _sum: { amountBase: true },
      }),
      this.prisma.journalLine.groupBy({
        by: ['currency', 'side'],
        where,
        _sum: { amountOriginal: true },
      }),
    ]);

    const baseMap = new Map<string, { debit: number; credit: number }>();
    for (const g of byBaseSide) {
      const bucket = baseMap.get(g.baseCurrencyCode) ?? { debit: 0, credit: 0 };
      const amt = Number(g._sum.amountBase ?? 0);
      if (g.side === JournalSide.DEBIT) bucket.debit += amt;
      else bucket.credit += amt;
      baseMap.set(g.baseCurrencyCode, bucket);
    }
    const byBaseCurrency = [...baseMap.entries()].map(
      ([currency, { debit, credit }]) => ({
        currency,
        totalDebitBase: round2(debit),
        totalCreditBase: round2(credit),
        balanceBase: round2(debit - credit),
      }),
    );

    const currencyMap = new Map<string, PartnerCurrencyBalanceDto>();
    for (const g of byCurrencySide) {
      const row: PartnerCurrencyBalanceDto = currencyMap.get(g.currency) ?? {
        currency: g.currency,
        debit: 0,
        credit: 0,
        net: 0,
      };
      const amt = Number(g._sum.amountOriginal ?? 0);
      if (g.side === JournalSide.DEBIT) row.debit += amt;
      else row.credit += amt;
      currencyMap.set(g.currency, row);
    }

    const dto = new PartnerBalanceResponseDto();
    dto.partnerId = partner.id;
    dto.ref = partner.ref;
    dto.name = partner.name;
    dto.asOf = asOfDate.toISOString().slice(0, 10);
    dto.byBaseCurrency = byBaseCurrency;
    if (byBaseCurrency.length === 1) {
      const r = byBaseCurrency[0];
      dto.baseCurrency = r.currency;
      dto.totalDebitBase = r.totalDebitBase;
      dto.totalCreditBase = r.totalCreditBase;
      dto.balanceBase = r.balanceBase;
    } else if (byBaseCurrency.length === 0) {
      const company = await this.prisma.company.findUniqueOrThrow({
        where: { id: partner.companyId },
        select: { baseCurrencyCode: true },
      });
      dto.baseCurrency = company.baseCurrencyCode;
      dto.totalDebitBase = 0;
      dto.totalCreditBase = 0;
      dto.balanceBase = 0;
    } else {
      // Mixed base currency: never sum across them (docs/URGENT.md §6.3).
      dto.baseCurrency = null;
      dto.totalDebitBase = null;
      dto.totalCreditBase = null;
      dto.balanceBase = null;
    }
    dto.byCurrency = [...currencyMap.values()].map((c) => ({
      currency: c.currency,
      debit: round2(c.debit),
      credit: round2(c.credit),
      net: round2(c.debit - c.credit),
    }));

    // Tier 2: present the balance in a requested currency (?presentIn).
    if (presentIn) {
      const rt = rateType ?? DEFAULT_RATE_TYPE;
      const rates: PartnerPresentationRateDto[] = [];
      let debit = 0;
      let credit = 0;
      let ok = true;
      for (const s of byBaseCurrency) {
        const pr = await resolvePresentationRate(
          this.prisma,
          partner.companyId,
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
      const cur = await this.prisma.currency.findUnique({
        where: { code: presentIn },
        select: { decimalPlaces: true },
      });
      const f = 10 ** (cur?.decimalPlaces ?? 2);
      const round = (n: number): number =>
        Math.round((n + Number.EPSILON) * f) / f;
      dto.presentation = {
        currency: presentIn,
        totalDebitBase: ok ? round(debit) : null,
        totalCreditBase: ok ? round(credit) : null,
        balanceBase: ok ? round(debit - credit) : null,
        rates,
      };
    } else {
      dto.presentation = null;
    }
    return dto;
  }

  async transactions(
    id: string,
    caller: AuthenticatedUser,
    query: PaginationQueryDto,
  ): Promise<Paginated<PartnerTransactionRowDto>> {
    const partner = await this.getOwned(id, caller);
    const { page, limit } = query;
    const where: Prisma.JournalLineWhereInput = {
      partnerId: id,
      companyId: partner.companyId,
      journalEntry: { status: JournalStatus.POSTED, deletedAt: null },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.journalLine.findMany({
        where,
        include: { journalEntry: true },
        orderBy: [{ journalEntry: { date: 'desc' } }, { lineNo: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalLine.count({ where }),
    ]);

    return Paginated.of(
      rows.map(PartnerTransactionRowDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  /**
   * The partner statement / relevé (FR-303): opening balance, each posted
   * transaction over [from, to] with a role-oriented running balance, and a
   * closing balance — in base currency (USD) and converted to LBP at the rate in
   * force on `to`. All derived from posted journal lines carrying the partnerId.
   */
  async statement(
    id: string,
    caller: AuthenticatedUser,
    query: QueryStatementDto,
  ): Promise<PartnerStatementResponseDto> {
    const partner = await this.getOwned(id, caller);
    const from = this.parseAsOf(query.from);
    const to = query.to ? this.parseAsOf(query.to) : new Date();
    if (from > to) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: '`from` must be on or before `to`.',
        field: 'from',
      });
    }
    const rateType = query.rateType ?? DEFAULT_RATE_TYPE;

    // Orientation: a customer (or both) reads as a receivable — positive means
    // they owe us (debit − credit). A supplier-only partner reads as a payable —
    // positive means we owe them (credit − debit).
    const receivable = partner.isCustomer || !partner.isSupplier;
    const sign = receivable ? 1 : -1;

    const postedBefore = {
      status: JournalStatus.POSTED,
      deletedAt: null,
      date: { lt: from },
    };
    const postedWithin = {
      status: JournalStatus.POSTED,
      deletedAt: null,
      date: { gte: from, lte: to },
    };

    const [openingAgg, lines] = await this.prisma.$transaction([
      this.prisma.journalLine.groupBy({
        by: ['side'],
        where: {
          partnerId: id,
          companyId: partner.companyId,
          journalEntry: postedBefore,
        },
        _sum: { amountBase: true },
      }),
      this.prisma.journalLine.findMany({
        where: {
          partnerId: id,
          companyId: partner.companyId,
          journalEntry: postedWithin,
        },
        include: { journalEntry: true },
        orderBy: [{ journalEntry: { date: 'asc' } }, { lineNo: 'asc' }],
      }),
    ]);

    let openingDebit = 0;
    let openingCredit = 0;
    for (const g of openingAgg) {
      const amt = Number(g._sum.amountBase ?? 0);
      if (g.side === JournalSide.DEBIT) openingDebit += amt;
      else openingCredit += amt;
    }
    const openingBalanceBase = round2(sign * (openingDebit - openingCredit));

    // Base currency of the statement, from the STORED baseCurrencyCode on the
    // partner's posted lines up to `to` (not the mutable company setting, and
    // not the old hardcoded 'USD'). Uniform in the normal case; falls back to
    // the company setting only when there are no postings, or (rarely) when the
    // history spans more than one base currency.
    const baseCodes = await this.prisma.journalLine.groupBy({
      by: ['baseCurrencyCode'],
      where: {
        partnerId: id,
        companyId: partner.companyId,
        journalEntry: {
          status: JournalStatus.POSTED,
          deletedAt: null,
          date: { lte: to },
        },
      },
    });
    // A statement is a single-currency running ledger — its opening balance and
    // running total can only be summed WITHIN one base currency. A partner whose
    // history spans more than one base currency (legacy data from before the
    // base-currency lock, Fix A) can't produce one meaningful running balance, so
    // we refuse rather than sum across currencies; the balance endpoint gives the
    // honest per-currency breakdown instead.
    if (baseCodes.length > 1) {
      throw new ConflictException({
        code: 'STATEMENT_MIXED_BASE',
        message:
          "This partner's history spans more than one base currency, so a single running statement can't be produced. Use GET /partners/:id/balance for the per-currency breakdown.",
        field: null,
      });
    }
    const statementBaseCurrency =
      baseCodes.length === 1
        ? baseCodes[0].baseCurrencyCode
        : (
            await this.prisma.company.findUniqueOrThrow({
              where: { id: partner.companyId },
              select: { baseCurrencyCode: true },
            })
          ).baseCurrencyCode;

    const rate = await this.rateInForce(
      partner.companyId,
      DISPLAY_CURRENCY,
      rateType,
      to,
    );
    const toDisplay = (usd: number): number | null =>
      rate === null ? null : round0(usd * rate.rate);

    let running = openingBalanceBase;
    let totalDebitBase = 0;
    let totalCreditBase = 0;
    const rows: StatementRowDto[] = lines.map((l) => {
      const debit = l.side === JournalSide.DEBIT ? Number(l.amountBase) : 0;
      const credit = l.side === JournalSide.CREDIT ? Number(l.amountBase) : 0;
      totalDebitBase += debit;
      totalCreditBase += credit;
      running = round2(running + sign * (debit - credit));
      return {
        date: l.journalEntry.date.toISOString().slice(0, 10),
        entryNumber: l.journalEntry.entryNumber,
        journalEntryId: l.journalEntryId,
        reference: l.journalEntry.reference,
        description: l.description,
        debitBase: round2(debit),
        creditBase: round2(credit),
        runningBalanceBase: running,
        amountOriginal: Number(l.amountOriginal),
        currency: l.currency,
        debitDisplay: toDisplay(debit),
        creditDisplay: toDisplay(credit),
        runningBalanceDisplay: toDisplay(running),
      };
    });

    const dto = new PartnerStatementResponseDto();
    dto.partnerId = partner.id;
    dto.ref = partner.ref;
    dto.name = partner.name;
    dto.from = from.toISOString().slice(0, 10);
    dto.to = to.toISOString().slice(0, 10);
    dto.baseCurrency = statementBaseCurrency;
    dto.displayCurrency = DISPLAY_CURRENCY;
    dto.orientation = receivable ? 'receivable' : 'payable';
    dto.conversion =
      rate === null
        ? null
        : {
            currency: DISPLAY_CURRENCY,
            rateType,
            rate: rate.rate,
            rateDate: rate.effectiveDate.toISOString().slice(0, 10),
          };
    dto.openingBalanceBase = openingBalanceBase;
    dto.openingBalanceDisplay = toDisplay(openingBalanceBase);
    dto.rows = rows;
    dto.totalDebitBase = round2(totalDebitBase);
    dto.totalCreditBase = round2(totalCreditBase);
    dto.totalDebitDisplay = toDisplay(round2(totalDebitBase));
    dto.totalCreditDisplay = toDisplay(round2(totalCreditBase));
    dto.closingBalanceBase = running;
    dto.closingBalanceDisplay = toDisplay(running);
    return dto;
  }

  // --- helpers -------------------------------------------------------------

  /** The exchange rate in force on a date (LBP per 1 USD), or null if none. */
  private async rateInForce(
    companyId: string,
    currencyCode: string,
    rateType: string,
    onDate: Date,
  ): Promise<{ rate: number; effectiveDate: Date } | null> {
    const row = await this.prisma.exchangeRate.findFirst({
      where: {
        companyId,
        currencyCode,
        rateType,
        effectiveDate: { lte: onDate },
      },
      orderBy: { effectiveDate: 'desc' },
      select: { rate: true, effectiveDate: true },
    });
    return row
      ? { rate: Number(row.rate), effectiveDate: row.effectiveDate }
      : null;
  }

  private async getOwned(id: string, caller: AuthenticatedUser) {
    const partner = await this.clientFor(caller).partner.findFirst({
      where: { id, deletedAt: null },
      include: PARTNER_WITH_ADDRESSES,
    });
    if (!partner) {
      throw new NotFoundException({
        code: 'PARTNER_NOT_FOUND',
        message: `Partner with id ${id} was not found.`,
        field: null,
      });
    }
    return partner;
  }

  /**
   * Resolve the receivable/payable account ids, defaulting each to the company
   * AR/AP control account for the relevant role, and return the `prefix` used to
   * auto-number the ref (the account a customer/both rolls into, else payable).
   */
  private async resolveAccounts(
    companyId: string,
    isCustomer: boolean,
    isSupplier: boolean,
    provided: { receivableAccountId?: string; payableAccountId?: string },
  ): Promise<{
    receivableAccountId: string | null;
    payableAccountId: string | null;
    prefix: string;
  }> {
    let receivable = provided.receivableAccountId
      ? await this.assertAccountInCompany(
          provided.receivableAccountId,
          companyId,
        )
      : null;
    let payable = provided.payableAccountId
      ? await this.assertAccountInCompany(provided.payableAccountId, companyId)
      : null;

    if (isCustomer && !receivable) {
      receivable = await this.controlAccount(companyId, ControlType.AR);
    }
    if (isSupplier && !payable) {
      payable = await this.controlAccount(companyId, ControlType.AP);
    }

    // Prefix from the primary control account: receivable for a customer/both,
    // payable for a supplier-only partner (decision: both → 41/AR).
    const primary = isCustomer ? receivable : payable;
    if (!primary) {
      throw new BadRequestException({
        code: 'CONTROL_ACCOUNT_MISSING',
        message:
          'No AR/AP control account found for this company. Seed the chart of accounts first.',
        field: null,
      });
    }

    return {
      receivableAccountId: receivable?.id ?? null,
      payableAccountId: payable?.id ?? null,
      prefix: primary.number,
    };
  }

  private async controlAccount(
    companyId: string,
    controlType: ControlType,
  ): Promise<{ id: string; number: string }> {
    const account = await this.prisma.account.findFirst({
      where: { companyId, isControl: true, controlType, deletedAt: null },
      orderBy: { number: 'asc' },
      select: { id: true, number: true },
    });
    if (!account) {
      throw new BadRequestException({
        code: 'CONTROL_ACCOUNT_MISSING',
        message: `No ${controlType} control account found for this company. Seed the chart of accounts first.`,
        field: null,
      });
    }
    return account;
  }

  private async assertAccountInCompany(
    accountId: string,
    companyId: string,
  ): Promise<{ id: string; number: string }> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId, deletedAt: null },
      select: { id: true, number: true },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: `Account with id ${accountId} was not found in this company.`,
        field: 'receivableAccountId',
      });
    }
    return account;
  }

  /** Next `<prefix><zero-padded counter>` not yet used in this company. */
  private async generateRef(
    client: Prisma.TransactionClient,
    companyId: string,
    prefix: string,
  ): Promise<string> {
    const rows = await client.partner.findMany({
      where: { companyId, ref: { startsWith: prefix } },
      select: { ref: true },
    });
    const re = new RegExp(`^${prefix}(\\d+)$`);
    let max = 0;
    for (const r of rows) {
      const m = re.exec(r.ref);
      if (m) {
        max = Math.max(max, Number(m[1]));
      }
    }
    return `${prefix}${String(max + 1).padStart(REF_PAD, '0')}`;
  }

  private normalizeAddresses(
    addresses: PartnerAddressDto[] | undefined,
  ): PartnerAddressDto[] | undefined {
    if (addresses === undefined) {
      return undefined;
    }
    const flagged = addresses.filter((a) => a.isDefault);
    if (flagged.length > 1) {
      throw new BadRequestException({
        code: 'MULTIPLE_DEFAULT_ADDRESSES',
        message: 'At most one address can be marked as default.',
        field: 'addresses',
      });
    }
    // Normalize: make the first the default when none is flagged.
    return addresses.map((a, i) => ({
      ...a,
      isDefault: flagged.length === 0 ? i === 0 : (a.isDefault ?? false),
    }));
  }

  private async assertCurrencyExists(code: string): Promise<void> {
    const currency = await this.prisma.currency.findUnique({ where: { code } });
    if (!currency) {
      throw new NotFoundException({
        code: 'CURRENCY_NOT_FOUND',
        message: `Currency with code ${code} was not found.`,
        field: 'creditCurrency',
      });
    }
  }

  private resolveCompanyId(
    companyIdArg: string | undefined,
    caller: AuthenticatedUser,
  ): string {
    if (!isPlatformAdmin(caller)) {
      if (!caller.companyId) {
        throw new BadRequestException({
          code: 'COMPANY_CONTEXT_REQUIRED',
          message:
            'No active company selected. Use POST /auth/switch-company to choose one.',
          field: null,
        });
      }
      return caller.companyId;
    }
    if (!companyIdArg) {
      throw new BadRequestException({
        code: 'COMPANY_ID_REQUIRED',
        message: 'A platform admin must specify companyId.',
        field: 'companyId',
      });
    }
    return companyIdArg;
  }

  private parseAsOf(asOf?: string): Date {
    if (!asOf) {
      return new Date();
    }
    const date = new Date(asOf);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `asOf is not a valid date: ${asOf}`,
        field: 'asOf',
      });
    }
    return date;
  }

  private isRefCollision(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_CONSTRAINT
    );
  }

  private mapWriteError(error: unknown, companyId?: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_FOREIGN_KEY_CONSTRAINT
    ) {
      return new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: `Company with id ${companyId} was not found.`,
        field: 'companyId',
      });
    }
    return error;
  }
}
