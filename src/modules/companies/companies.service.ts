import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import { AccountsService } from '../accounts/accounts.service';
import { TaxesService } from '../taxes/taxes.service';
import { SequencesService } from '../sequences/sequences.service';
import { LocationsService } from '../stock/locations.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import {
  RoundingSettingDto,
  UpdateCompanySettingsDto,
} from './dto/update-company-settings.dto';
import { CompanySettingsResponseDto } from './dto/company-settings-response.dto';

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const COMPANY_ADMIN_ROLE_NAME = 'Company Admin';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly taxesService: TaxesService,
    private readonly sequencesService: SequencesService,
    private readonly locationsService: LocationsService,
  ) {}

  /**
   * Create a company via POST /companies. A company user creates a company they
   * own (they become a member + Company Admin); a platform admin may create one
   * and optionally attach it to a user via `ownerUserId`. Either way the company
   * is fully provisioned (chart/VAT/sequences) in one transaction.
   */
  async create(
    dto: CreateCompanyDto,
    caller: AuthenticatedUser,
  ): Promise<CompanyResponseDto> {
    if (!isPlatformAdmin(caller)) {
      await this.assertCanCreateCompany(caller.userId);
    }
    const ownerUserId = isPlatformAdmin(caller)
      ? (dto.ownerUserId ?? null)
      : caller.userId;
    if (ownerUserId) {
      await this.assertUserExists(ownerUserId);
    }
    return this.prisma.$transaction((tx) =>
      this.provision(dto, ownerUserId, tx),
    );
  }

  /**
   * Create a company and (optionally) make `ownerUserId` its first member +
   * Company Admin, then seed the default chart (FR-104), VAT (FR-105) and
   * document sequences (FR-106). Runs inside a caller-supplied transaction so
   * either the whole company is set up or none of it is. Shared by
   * POST /companies and /auth/register.
   */
  async provision(
    dto: CreateCompanyDto,
    ownerUserId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<CompanyResponseDto> {
    // ownerUserId is passed separately (not a Company column); keep it out of
    // the create payload.
    const companyData = { ...dto };
    delete companyData.ownerUserId;
    if (companyData.baseCurrencyCode) {
      await this.assertCurrencyExists(companyData.baseCurrencyCode);
    }

    let company: Company;
    try {
      company = await tx.company.create({ data: companyData });
    } catch (error) {
      throw this.mapWriteError(error, dto.taxNumber);
    }

    if (ownerUserId) {
      await tx.userCompany.create({
        data: { userId: ownerUserId, companyId: company.id },
      });
      const adminRole = await tx.role.findFirstOrThrow({
        where: { name: COMPANY_ADMIN_ROLE_NAME, isSystem: true },
      });
      await tx.userRole.create({
        data: {
          userId: ownerUserId,
          roleId: adminRole.id,
          companyId: company.id,
        },
      });
    }

    await this.accountsService.applyDefaultChart(company.id, tx);
    await this.taxesService.applyDefaultVatRate(company.id, tx);
    await this.sequencesService.applyDefaultSequences(company.id, tx);
    await this.locationsService.applyDefaultLocations(company.id, tx);

    return CompanyResponseDto.fromEntity(company);
  }

  /**
   * Platform admin sees every company; a company user sees only the companies
   * they belong to (their memberships) — this is how an owner lists their
   * own companies.
   */
  async findAll(
    query: PaginationQueryDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<CompanyResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
    const where: Prisma.CompanyWhereInput = { deletedAt: null };
    if (!isPlatformAdmin(caller)) {
      where.members = { some: { userId: caller.userId } };
    }
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
    const existing = await this.getRawCompany(id);
    if (dto.baseCurrencyCode) {
      await this.assertCurrencyExists(dto.baseCurrencyCode);
      await this.assertBaseCurrencyChangeAllowed(
        id,
        dto.baseCurrencyCode,
        existing.baseCurrencyCode,
      );
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
   *
   * baseCurrencyCode/fiscalYearStartMonth are Company columns rather than
   * settings-JSON keys, and are written as such — getSettings() has always
   * returned them, so accepting them here is what makes this endpoint's read
   * and write shapes agree.
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

    // baseCurrencyCode / fiscalYearStartMonth are Company columns, not
    // settings-JSON keys — resolveSettings() reads them from the row. Writing
    // them into `merged` would put them somewhere nothing ever reads, so they
    // go into the same UPDATE as their own columns.
    const columns: Prisma.CompanyUncheckedUpdateInput = {};
    if (dto.baseCurrencyCode !== undefined) {
      await this.assertCurrencyExists(dto.baseCurrencyCode);
      await this.assertBaseCurrencyChangeAllowed(
        id,
        dto.baseCurrencyCode,
        company.baseCurrencyCode,
      );
      columns.baseCurrencyCode = dto.baseCurrencyCode;
    }
    if (dto.fiscalYearStartMonth !== undefined) {
      columns.fiscalYearStartMonth = dto.fiscalYearStartMonth;
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: { ...columns, settings: merged as Prisma.InputJsonValue },
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

  /**
   * A company user may create a company only if they hold the company.create
   * permission through one of their roles — i.e. they are a Company Admin of at
   * least one company. Checked across ALL their memberships (not just the active
   * company), so no company switch is required to create another. Platform
   * admins bypass this (manage-all).
   */
  private async assertCanCreateCompany(userId: string): Promise<void> {
    const grant = await this.prisma.userRole.findFirst({
      where: {
        userId,
        role: {
          permissions: {
            some: { permission: { subject: 'Company', action: 'create' } },
          },
        },
      },
      select: { userId: true },
    });
    if (!grant) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'You do not have permission to create a company.',
        field: null,
      });
    }
  }

  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User with id ${userId} was not found.`,
        field: 'ownerUserId',
      });
    }
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

  /**
   * The base currency is the currency the company's books are kept in. Changing
   * it once anything has been posted would silently re-denominate every stored
   * base amount (a 100 USD balance reading as "100 LBP") and mis-scale the stock
   * valuation — the same mislabel the per-line baseCurrencyCode stamping was
   * added to prevent (docs/PROGRESS.md (base-currency)). Real ERPs fix it at setup, so we reject
   * the change once the company has any postings (journal lines or stock
   * movements). A no-op (same code) is always allowed.
   */
  private async assertBaseCurrencyChangeAllowed(
    companyId: string,
    newCode: string,
    currentCode: string,
  ): Promise<void> {
    if (newCode === currentCode) return;
    const [lines, movements] = await Promise.all([
      this.prisma.journalLine.count({ where: { companyId } }),
      this.prisma.stockMovement.count({ where: { companyId } }),
    ]);
    if (lines > 0 || movements > 0) {
      throw new ConflictException({
        code: 'BASE_CURRENCY_LOCKED',
        message:
          'The base currency cannot be changed once the company has postings (journal lines or stock movements); it fixes the currency the books are kept in.',
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
