import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { CurrencyResponseDto } from './dto/currency-response.dto';

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const PRISMA_FOREIGN_KEY_CONSTRAINT = 'P2003';

// Postgres SQLSTATEs for a blocked delete: 23503 foreign_key_violation and
// 23001 restrict_violation (raised specifically by an ON DELETE RESTRICT FK).
const FK_PG_CODES = new Set(['23503', '23001']);

// Prisma 7's pg adapter translates an INSERT foreign-key violation into a
// PrismaClientKnownRequestError (P2003), but a DELETE blocked by a RESTRICT
// foreign key surfaces as a raw DriverAdapterError carrying the underlying pg
// error code on `cause.code`. Recognize both so "currency in use" is reported
// consistently as a 409 rather than leaking a 500.
function isForeignKeyViolation(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === PRISMA_FOREIGN_KEY_CONSTRAINT
  ) {
    return true;
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as { name?: string; cause?: { code?: string } };
    return (
      e.name === 'DriverAdapterError' && FK_PG_CODES.has(e.cause?.code ?? '')
    );
  }
  return false;
}

const ALLOWED_SORT_FIELDS = [
  'code',
  'name',
  'isActive',
  'createdAt',
  'updatedAt',
];

/**
 * Currencies are global reference/configuration data (FR-103) — shared by
 * every tenant, so this service uses the bare PrismaService (no forTenant).
 * Access is gated at the controller by the currency.* permissions.
 */
@Injectable()
export class CurrenciesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCurrencyDto): Promise<CurrencyResponseDto> {
    try {
      const currency = await this.prisma.currency.create({ data: dto });
      return CurrencyResponseDto.fromEntity(currency);
    } catch (error) {
      throw this.mapWriteError(error, dto.code);
    }
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<Paginated<CurrencyResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.CurrencyOrderByWithRelationInput;

    const [currencies, total] = await this.prisma.$transaction([
      this.prisma.currency.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      this.prisma.currency.count(),
    ]);

    return Paginated.of(
      currencies.map(CurrencyResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(code: string): Promise<CurrencyResponseDto> {
    const currency = await this.prisma.currency.findUnique({ where: { code } });
    if (!currency) {
      throw this.notFound(code);
    }
    return CurrencyResponseDto.fromEntity(currency);
  }

  async update(
    code: string,
    dto: UpdateCurrencyDto,
  ): Promise<CurrencyResponseDto> {
    await this.findOne(code);
    const currency = await this.prisma.currency.update({
      where: { code },
      data: dto,
    });
    return CurrencyResponseDto.fromEntity(currency);
  }

  async remove(code: string): Promise<void> {
    await this.findOne(code);
    try {
      // Configuration table — a hard delete is allowed (docs/MODELS.md), unlike
      // financial records which soft-delete.
      await this.prisma.currency.delete({ where: { code } });
    } catch (error) {
      throw this.mapWriteError(error, code);
    }
  }

  private notFound(code: string): NotFoundException {
    return new NotFoundException({
      code: 'CURRENCY_NOT_FOUND',
      message: `Currency with code ${code} was not found.`,
      field: null,
    });
  }

  private mapWriteError(error: unknown, code: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_CONSTRAINT
    ) {
      return new ConflictException({
        code: 'CURRENCY_CODE_ALREADY_EXISTS',
        message: `Currency with code ${code} already exists.`,
        field: 'code',
      });
    }
    if (isForeignKeyViolation(error)) {
      return new ConflictException({
        code: 'CURRENCY_IN_USE',
        message: `Currency ${code} is referenced by existing exchange rates and cannot be deleted.`,
        field: null,
      });
    }
    return error;
  }
}
