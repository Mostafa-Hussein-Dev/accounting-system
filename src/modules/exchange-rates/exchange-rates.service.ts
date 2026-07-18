import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { UpdateExchangeRateDto } from './dto/update-exchange-rate.dto';
import { QueryExchangeRateDto } from './dto/query-exchange-rate.dto';
import { CurrentExchangeRateDto } from './dto/current-exchange-rate.dto';
import { ExchangeRateResponseDto } from './dto/exchange-rate-response.dto';

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const PRISMA_FOREIGN_KEY_CONSTRAINT = 'P2003';
const ALLOWED_SORT_FIELDS = [
  'effectiveDate',
  'rateType',
  'currencyCode',
  'rate',
  'createdAt',
  'updatedAt',
];

@Injectable()
export class ExchangeRatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A platform admin (no companyId of their own) gets the bare client and must
   * name the target company via the DTO. A company-scoped caller gets
   * forTenant(companyId), which forces every read/write to their own company —
   * silently overriding any companyId submitted. Identical to BranchesService.
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
    dto: CreateExchangeRateDto,
    caller: AuthenticatedUser,
  ): Promise<ExchangeRateResponseDto> {
    // Currencies are global reference data — validate against the shared table
    // up front so a bad currencyCode surfaces as CURRENCY_NOT_FOUND rather than
    // an opaque foreign-key error (which we reserve for the company FK).
    await this.assertCurrencyExists(dto.currencyCode);

    const client = this.clientFor(caller);
    try {
      const rate = await client.exchangeRate.create({
        data: {
          currencyCode: dto.currencyCode,
          rateType: dto.rateType,
          effectiveDate: new Date(dto.effectiveDate),
          rate: dto.rate,
          companyId: dto.companyId,
        } as Prisma.ExchangeRateUncheckedCreateInput,
      });
      return ExchangeRateResponseDto.fromEntity(rate);
    } catch (error) {
      throw this.mapWriteError(error, dto);
    }
  }

  async findAll(
    query: QueryExchangeRateDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<ExchangeRateResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
    const where = this.buildWhere(query);
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.ExchangeRateOrderByWithRelationInput;
    const client = this.clientFor(caller);

    const [rates, total] = await this.prisma.$transaction([
      client.exchangeRate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      client.exchangeRate.count({ where }),
    ]);

    return Paginated.of(
      rates.map(ExchangeRateResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<ExchangeRateResponseDto> {
    const rate = await this.clientFor(caller).exchangeRate.findFirst({
      where: { id },
    });
    if (!rate) {
      throw this.notFound(id);
    }
    return ExchangeRateResponseDto.fromEntity(rate);
  }

  /**
   * The rate in force on a date (FR-103): the newest rate whose effectiveDate
   * is on or before the requested date, for a given currency + rate type. This
   * is the default a document uses before any operator override.
   */
  async findCurrent(
    query: CurrentExchangeRateDto,
    caller: AuthenticatedUser,
  ): Promise<ExchangeRateResponseDto> {
    const onDate = query.date ? new Date(query.date) : new Date();
    const where: Prisma.ExchangeRateWhereInput = {
      currencyCode: query.currencyCode,
      rateType: query.rateType,
      effectiveDate: { lte: onDate },
    };
    if (query.companyId) {
      where.companyId = query.companyId;
    }

    const rate = await this.clientFor(caller).exchangeRate.findFirst({
      where,
      orderBy: { effectiveDate: 'desc' },
    });
    if (!rate) {
      throw new NotFoundException({
        code: 'EXCHANGE_RATE_NOT_FOUND',
        message: `No ${query.rateType} rate for ${query.currencyCode} is in force on ${onDate.toISOString().slice(0, 10)}.`,
        field: null,
      });
    }
    return ExchangeRateResponseDto.fromEntity(rate);
  }

  async update(
    id: string,
    dto: UpdateExchangeRateDto,
    caller: AuthenticatedUser,
  ): Promise<ExchangeRateResponseDto> {
    await this.findOne(id, caller);
    if (dto.currencyCode) {
      await this.assertCurrencyExists(dto.currencyCode);
    }
    const client = this.clientFor(caller);
    try {
      const rate = await client.exchangeRate.update({
        where: { id },
        data: {
          currencyCode: dto.currencyCode,
          rateType: dto.rateType,
          effectiveDate: dto.effectiveDate
            ? new Date(dto.effectiveDate)
            : undefined,
          rate: dto.rate,
        },
      });
      return ExchangeRateResponseDto.fromEntity(rate);
    } catch (error) {
      throw this.mapWriteError(error, { ...dto, companyId: undefined });
    }
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.findOne(id, caller);
    // Configuration data — hard delete is allowed (docs/MODELS.md). Editing or
    // removing a rate never touches already-posted amounts, which froze their
    // own rate at posting time.
    await this.clientFor(caller).exchangeRate.delete({ where: { id } });
  }

  private buildWhere(
    query: QueryExchangeRateDto,
  ): Prisma.ExchangeRateWhereInput {
    const where: Prisma.ExchangeRateWhereInput = {};
    if (query.currencyCode) {
      where.currencyCode = query.currencyCode;
    }
    if (query.rateType) {
      where.rateType = query.rateType;
    }
    if (query.companyId) {
      where.companyId = query.companyId;
    }
    if (query.dateFrom || query.dateTo) {
      where.effectiveDate = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }
    return where;
  }

  private async assertCurrencyExists(code: string): Promise<void> {
    const currency = await this.prisma.currency.findUnique({ where: { code } });
    if (!currency) {
      throw new NotFoundException({
        code: 'CURRENCY_NOT_FOUND',
        message: `Currency with code ${code} was not found.`,
        field: 'currencyCode',
      });
    }
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({
      code: 'EXCHANGE_RATE_NOT_FOUND',
      message: `Exchange rate with id ${id} was not found.`,
      field: null,
    });
  }

  private mapWriteError(
    error: unknown,
    context: { currencyCode?: string; rateType?: string; companyId?: string },
  ): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === PRISMA_UNIQUE_CONSTRAINT) {
        return new ConflictException({
          code: 'EXCHANGE_RATE_ALREADY_EXISTS',
          message: `A ${context.rateType ?? ''} rate for ${context.currencyCode ?? 'this currency'} already exists on that date. Update it instead.`,
          field: null,
        });
      }
      if (error.code === PRISMA_FOREIGN_KEY_CONSTRAINT) {
        // Currency FK is pre-validated in assertCurrencyExists, so a foreign-key
        // failure that reaches here is the company FK (platform-admin path).
        return new NotFoundException({
          code: 'COMPANY_NOT_FOUND',
          message: `Company with id ${context.companyId} was not found.`,
          field: 'companyId',
        });
      }
    }
    return error;
  }
}
