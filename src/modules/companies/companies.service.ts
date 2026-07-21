import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import {
  RoundingSettingDto,
  UpdateCompanySettingsDto,
} from './dto/update-company-settings.dto';
import { CompanySettingsResponseDto } from './dto/company-settings-response.dto';

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const ALLOWED_SORT_FIELDS = [
  'name',
  'taxNumber',
  'isActive',
  'createdAt',
  'updatedAt',
];

const DEFAULT_ROUNDING = { decimals: 2, mode: 'HALF_UP' as const };

// The shape of the company `settings` JSON bucket (FR-108). Every key is
// optional in storage; getSettings() fills defaults.
interface StoredSettings {
  rounding?: { decimals: number; mode: string };
  defaultTemplates?: Record<string, string>;
  enabledModules?: string[];
  featureFlags?: Record<string, boolean>;
  fieldVisibility?: Record<string, boolean>;
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateCompanyDto,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<CompanyResponseDto> {
    if (dto.baseCurrencyCode) {
      await this.assertCurrencyExists(dto.baseCurrencyCode);
    }
    try {
      const company = await client.company.create({ data: dto });
      return CompanyResponseDto.fromEntity(company);
    } catch (error) {
      throw this.mapWriteError(error, dto.taxNumber);
    }
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<Paginated<CompanyResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
    const where: Prisma.CompanyWhereInput = { deletedAt: null };
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.CompanyOrderByWithRelationInput;

    const [companies, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      this.prisma.company.count({ where }),
    ]);

    return Paginated.of(
      companies.map(CompanyResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string): Promise<CompanyResponseDto> {
    return CompanyResponseDto.fromEntity(await this.getRawCompany(id));
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<CompanyResponseDto> {
    await this.getRawCompany(id);
    if (dto.baseCurrencyCode) {
      await this.assertCurrencyExists(dto.baseCurrencyCode);
    }
    try {
      const company = await this.prisma.company.update({
        where: { id },
        data: dto,
      });
      return CompanyResponseDto.fromEntity(company);
    } catch (error) {
      throw this.mapWriteError(error, dto.taxNumber);
    }
  }

  async remove(id: string): Promise<void> {
    await this.getRawCompany(id);
    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** The full resolved per-company configuration (FR-108). */
  async getSettings(id: string): Promise<CompanySettingsResponseDto> {
    return this.resolveSettings(await this.getRawCompany(id));
  }

  /**
   * Merge a partial settings payload into the company's `settings` JSON
   * (FR-108). rounding/enabledModules are replaced wholesale; the record-typed
   * keys (defaultTemplates/featureFlags/fieldVisibility) are deep-merged so a
   * single flag can be toggled without resending the whole set.
   */
  async updateSettings(
    id: string,
    dto: UpdateCompanySettingsDto,
  ): Promise<CompanySettingsResponseDto> {
    const company = await this.getRawCompany(id);
    const current = (company.settings ?? {}) as StoredSettings;
    const merged: StoredSettings = { ...current };

    if (dto.rounding !== undefined) {
      merged.rounding = dto.rounding;
    }
    if (dto.enabledModules !== undefined) {
      merged.enabledModules = dto.enabledModules;
    }
    if (dto.defaultTemplates !== undefined) {
      merged.defaultTemplates = {
        ...(current.defaultTemplates ?? {}),
        ...dto.defaultTemplates,
      };
    }
    if (dto.featureFlags !== undefined) {
      merged.featureFlags = {
        ...(current.featureFlags ?? {}),
        ...dto.featureFlags,
      };
    }
    if (dto.fieldVisibility !== undefined) {
      merged.fieldVisibility = {
        ...(current.fieldVisibility ?? {}),
        ...dto.fieldVisibility,
      };
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: { settings: merged as Prisma.InputJsonValue },
    });
    return this.resolveSettings(updated);
  }

  private resolveSettings(company: Company): CompanySettingsResponseDto {
    const s = (company.settings ?? {}) as StoredSettings;
    const dto = new CompanySettingsResponseDto();
    dto.baseCurrencyCode = company.baseCurrencyCode;
    dto.fiscalYearStartMonth = company.fiscalYearStartMonth;
    dto.rounding = (s.rounding as RoundingSettingDto) ?? {
      ...DEFAULT_ROUNDING,
    };
    dto.defaultTemplates = s.defaultTemplates ?? {};
    dto.enabledModules = s.enabledModules ?? [];
    dto.featureFlags = s.featureFlags ?? {};
    dto.fieldVisibility = s.fieldVisibility ?? {};
    return dto;
  }

  private async getRawCompany(id: string): Promise<Company> {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: `Company with id ${id} was not found.`,
        field: null,
      });
    }
    return company;
  }

  private async assertCurrencyExists(code: string): Promise<void> {
    const currency = await this.prisma.currency.findUnique({ where: { code } });
    if (!currency) {
      throw new BadRequestException({
        code: 'INVALID_BASE_CURRENCY',
        message: `Currency ${code} was not found.`,
        field: 'baseCurrencyCode',
      });
    }
  }

  private mapWriteError(error: unknown, taxNumber?: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_CONSTRAINT
    ) {
      return new ConflictException({
        code: 'COMPANY_TAX_NUMBER_ALREADY_EXISTS',
        message: `A company with tax number "${taxNumber}" already exists.`,
        field: 'taxNumber',
      });
    }
    return error;
  }
}
