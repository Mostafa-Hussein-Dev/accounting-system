import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ControlType, Prisma, TaxRate, TaxTreatment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';
import { QueryTaxRateDto } from './dto/query-tax-rate.dto';
import { CurrentTaxRateDto } from './dto/current-tax-rate.dto';
import { TaxRateResponseDto } from './dto/tax-rate-response.dto';

const PRISMA_FOREIGN_KEY_CONSTRAINT = 'P2003';
const ALLOWED_SORT_FIELDS = [
  'name',
  'ratePct',
  'treatment',
  'effectiveDate',
  'isActive',
  'createdAt',
  'updatedAt',
];

// Lebanon's standard VAT (FR-105: default 11%, editable to 12%+). Seeded for
// every company so a fresh tenant can invoice with VAT out of the box.
const DEFAULT_VAT_RATE_PCT = 11;
const DEFAULT_VAT_NAME = 'Standard VAT 11%';
// Broad past effective date so the default is in force for any current document.
const DEFAULT_VAT_EFFECTIVE_DATE = new Date('2020-01-01T00:00:00.000Z');

@Injectable()
export class TaxesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Platform admin gets the bare client and targets a company via the DTO; a
   * company-scoped caller gets forTenant(companyId), which forces every
   * read/write to their own company. Identical to ExchangeRatesService.
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
    dto: CreateTaxRateDto,
    caller: AuthenticatedUser,
  ): Promise<TaxRateResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    this.validateTreatmentRules(
      dto.treatment,
      dto.ratePct,
      dto.vatOutAccountId ?? null,
      dto.vatInAccountId ?? null,
    );
    await this.assertVatAccounts(
      companyId,
      dto.vatOutAccountId ?? null,
      dto.vatInAccountId ?? null,
    );

    try {
      const rate = await this.prisma.taxRate.create({
        data: {
          companyId,
          name: dto.name,
          ratePct: dto.ratePct,
          treatment: dto.treatment,
          effectiveDate: new Date(dto.effectiveDate),
          vatOutAccountId: dto.vatOutAccountId ?? null,
          vatInAccountId: dto.vatInAccountId ?? null,
        },
      });
      return TaxRateResponseDto.fromEntity(rate);
    } catch (error) {
      throw this.mapWriteError(error, companyId);
    }
  }

  async findAll(
    query: QueryTaxRateDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<TaxRateResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'effectiveDate';
    const where: Prisma.TaxRateWhereInput = {};
    if (query.treatment) {
      where.treatment = query.treatment;
    }
    if (query.companyId) {
      where.companyId = query.companyId;
    }
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.TaxRateOrderByWithRelationInput;
    const client = this.clientFor(caller);

    const [rates, total] = await this.prisma.$transaction([
      client.taxRate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      client.taxRate.count({ where }),
    ]);

    return Paginated.of(
      rates.map(TaxRateResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  /**
   * The VAT rate in force on a date (FR-105): the newest rate whose
   * effectiveDate is on or before the requested date, for a given treatment.
   * This is the default a document uses when computing VAT.
   */
  async findCurrent(
    query: CurrentTaxRateDto,
    caller: AuthenticatedUser,
  ): Promise<TaxRateResponseDto> {
    const onDate = query.date ? new Date(query.date) : new Date();
    const where: Prisma.TaxRateWhereInput = {
      treatment: query.treatment,
      effectiveDate: { lte: onDate },
    };
    if (query.companyId) {
      where.companyId = query.companyId;
    }

    const rate = await this.clientFor(caller).taxRate.findFirst({
      where,
      orderBy: { effectiveDate: 'desc' },
    });
    if (!rate) {
      throw new NotFoundException({
        code: 'TAX_RATE_NOT_FOUND',
        message: `No ${query.treatment} tax rate is in force on ${onDate.toISOString().slice(0, 10)}.`,
        field: null,
      });
    }
    return TaxRateResponseDto.fromEntity(rate);
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<TaxRateResponseDto> {
    const rate = await this.clientFor(caller).taxRate.findFirst({
      where: { id },
    });
    if (!rate) {
      throw this.notFound(id);
    }
    return TaxRateResponseDto.fromEntity(rate);
  }

  async update(
    id: string,
    dto: UpdateTaxRateDto,
    caller: AuthenticatedUser,
  ): Promise<TaxRateResponseDto> {
    const existing = await this.findOne(id, caller);

    // Validate the merged (post-update) state, so partial updates can't leave a
    // rate in an inconsistent treatment/rate/account combination.
    const treatment = dto.treatment ?? existing.treatment;
    const ratePct = dto.ratePct ?? existing.ratePct;
    const vatOutAccountId =
      dto.vatOutAccountId !== undefined
        ? dto.vatOutAccountId
        : existing.vatOutAccountId;
    const vatInAccountId =
      dto.vatInAccountId !== undefined
        ? dto.vatInAccountId
        : existing.vatInAccountId;

    this.validateTreatmentRules(
      treatment,
      ratePct,
      vatOutAccountId,
      vatInAccountId,
    );
    await this.assertVatAccounts(
      existing.companyId,
      vatOutAccountId,
      vatInAccountId,
    );

    const client = this.clientFor(caller);
    const rate = await client.taxRate.update({
      where: { id },
      data: {
        name: dto.name,
        ratePct: dto.ratePct,
        treatment: dto.treatment,
        effectiveDate: dto.effectiveDate
          ? new Date(dto.effectiveDate)
          : undefined,
        vatOutAccountId: dto.vatOutAccountId,
        vatInAccountId: dto.vatInAccountId,
        isActive: dto.isActive,
      },
    });
    return TaxRateResponseDto.fromEntity(rate);
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.findOne(id, caller);
    // Configuration data — hard delete is allowed (docs/MODELS.md). Editing or
    // removing a rate never touches already-posted amounts.
    await this.clientFor(caller).taxRate.delete({ where: { id } });
  }

  /**
   * Seed a company's default standard VAT rate (FR-105), wired to its seeded
   * VAT_OUT / VAT_IN control accounts. Idempotent — a no-op if a standard rate
   * already exists. Called from AuthService.register in the same transaction
   * (client may be a transaction client).
   */
  async applyDefaultVatRate(
    companyId: string,
    client: Prisma.TransactionClient,
  ): Promise<TaxRate | null> {
    const existing = await client.taxRate.findFirst({
      where: { companyId, treatment: TaxTreatment.STANDARD },
    });
    if (existing) {
      return null;
    }
    const [vatOut, vatIn] = await Promise.all([
      client.account.findFirst({
        where: { companyId, controlType: ControlType.VAT_OUT },
      }),
      client.account.findFirst({
        where: { companyId, controlType: ControlType.VAT_IN },
      }),
    ]);
    return client.taxRate.create({
      data: {
        companyId,
        name: DEFAULT_VAT_NAME,
        ratePct: DEFAULT_VAT_RATE_PCT,
        treatment: TaxTreatment.STANDARD,
        effectiveDate: DEFAULT_VAT_EFFECTIVE_DATE,
        vatOutAccountId: vatOut?.id ?? null,
        vatInAccountId: vatIn?.id ?? null,
      },
    });
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
          'A platform admin must specify companyId when creating a tax rate.',
        field: 'companyId',
      });
    }
    return dtoCompanyId;
  }

  /** Enforce the treatment ↔ rate ↔ VAT-account consistency rules. */
  private validateTreatmentRules(
    treatment: TaxTreatment,
    ratePct: number,
    vatOutAccountId: string | null,
    vatInAccountId: string | null,
  ): void {
    if (treatment === TaxTreatment.STANDARD) {
      if (ratePct <= 0) {
        throw new BadRequestException({
          code: 'TAX_RATE_MUST_BE_POSITIVE',
          message: 'A standard tax rate must have a ratePct greater than 0.',
          field: 'ratePct',
        });
      }
      if (!vatOutAccountId || !vatInAccountId) {
        throw new BadRequestException({
          code: 'VAT_ACCOUNTS_REQUIRED',
          message:
            'A standard tax rate must map both an output-VAT and an input-VAT account.',
          field: 'vatOutAccountId',
        });
      }
      return;
    }
    // ZERO / EXEMPT
    if (ratePct !== 0) {
      throw new BadRequestException({
        code: 'TAX_RATE_MUST_BE_ZERO',
        message: 'A zero-rated or exempt tax rate must have a ratePct of 0.',
        field: 'ratePct',
      });
    }
    if (vatOutAccountId || vatInAccountId) {
      throw new BadRequestException({
        code: 'VAT_ACCOUNTS_NOT_ALLOWED',
        message:
          'A zero-rated or exempt tax rate must not map any VAT account.',
        field: 'vatOutAccountId',
      });
    }
  }

  private async assertVatAccounts(
    companyId: string,
    vatOutAccountId: string | null,
    vatInAccountId: string | null,
  ): Promise<void> {
    if (vatOutAccountId) {
      await this.assertVatAccount(
        vatOutAccountId,
        companyId,
        ControlType.VAT_OUT,
        'vatOutAccountId',
      );
    }
    if (vatInAccountId) {
      await this.assertVatAccount(
        vatInAccountId,
        companyId,
        ControlType.VAT_IN,
        'vatInAccountId',
      );
    }
  }

  /** The mapped account must exist in the company and be the matching VAT control account. */
  private async assertVatAccount(
    accountId: string,
    companyId: string,
    expected: ControlType,
    field: string,
  ): Promise<void> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId, deletedAt: null },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'VAT_ACCOUNT_NOT_FOUND',
        message: `Account ${accountId} was not found in this company.`,
        field,
      });
    }
    if (!account.isControl || account.controlType !== expected) {
      throw new BadRequestException({
        code: 'VAT_ACCOUNT_WRONG_TYPE',
        message: `Account ${account.number} must be a ${expected} control account.`,
        field,
      });
    }
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({
      code: 'TAX_RATE_NOT_FOUND',
      message: `Tax rate with id ${id} was not found.`,
      field: null,
    });
  }

  private mapWriteError(error: unknown, companyId: string): unknown {
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
