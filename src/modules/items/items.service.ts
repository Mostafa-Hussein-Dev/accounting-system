import {
  BadRequestException,
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
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemDto } from './dto/query-item.dto';
import { ItemResponseDto } from './dto/item-response.dto';

const PRISMA_UNIQUE = 'P2002';
const PRISMA_FK = 'P2003';
const ALLOWED_SORT_FIELDS = ['code', 'name', 'createdAt', 'updatedAt'];

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) {
      return this.prisma;
    }
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  async create(
    dto: CreateItemDto,
    caller: AuthenticatedUser,
  ): Promise<ItemResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    await this.validateRefs(dto, companyId, {});
    const priceCurrency =
      dto.priceCurrency ?? (await this.baseCurrency(companyId));

    try {
      const item = await this.clientFor(caller).item.create({
        data: {
          companyId,
          code: dto.code,
          name: dto.name,
          nameAr: dto.nameAr ?? null,
          nameFr: dto.nameFr ?? null,
          nameEn: dto.nameEn ?? null,
          description: dto.description ?? null,
          categoryId: dto.categoryId ?? null,
          brandId: dto.brandId ?? null,
          familyId: dto.familyId ?? null,
          baseUomId: dto.baseUomId,
          salesUomId: dto.salesUomId ?? null,
          purchaseUomId: dto.purchaseUomId ?? null,
          costPrice: dto.costPrice ?? 0,
          salePrice: dto.salePrice ?? 0,
          priceCurrency,
          vatTreatment: dto.vatTreatment ?? undefined,
          defaultTaxRateId: dto.defaultTaxRateId ?? null,
          hasSize: dto.hasSize ?? false,
          hasColour: dto.hasColour ?? false,
          trackSerial: dto.trackSerial ?? false,
          trackExpiry: dto.trackExpiry ?? false,
          imageUrls: dto.imageUrls ?? [],
          isActive: dto.isActive ?? true,
        },
      });
      return ItemResponseDto.fromEntity(item);
    } catch (error) {
      throw this.mapWriteError(error, dto.code, companyId);
    }
  }

  async findAll(
    query: QueryItemDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<ItemResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'code';
    const where: Prisma.ItemWhereInput = { deletedAt: null };
    if (query.companyId) where.companyId = query.companyId;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.brandId) where.brandId = query.brandId;
    if (query.familyId) where.familyId = query.familyId;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.q) {
      where.OR = [
        { code: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const client = this.clientFor(caller);
    const [rows, total] = await this.prisma.$transaction([
      client.item.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      client.item.count({ where }),
    ]);
    return Paginated.of(
      rows.map(ItemResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<ItemResponseDto> {
    return ItemResponseDto.fromEntity(await this.getOwned(id, caller));
  }

  async update(
    id: string,
    dto: UpdateItemDto,
    caller: AuthenticatedUser,
  ): Promise<ItemResponseDto> {
    const existing = await this.getOwned(id, caller);
    await this.validateRefs(dto, existing.companyId, existing);

    const data: Prisma.ItemUncheckedUpdateInput = {};
    const set = <K extends keyof UpdateItemDto>(key: K, col: string): void => {
      if (dto[key] !== undefined)
        (data as Record<string, unknown>)[col] = dto[key];
    };
    set('code', 'code');
    set('name', 'name');
    set('nameAr', 'nameAr');
    set('nameFr', 'nameFr');
    set('nameEn', 'nameEn');
    set('description', 'description');
    set('categoryId', 'categoryId');
    set('brandId', 'brandId');
    set('familyId', 'familyId');
    set('baseUomId', 'baseUomId');
    set('salesUomId', 'salesUomId');
    set('purchaseUomId', 'purchaseUomId');
    set('costPrice', 'costPrice');
    set('salePrice', 'salePrice');
    set('priceCurrency', 'priceCurrency');
    set('vatTreatment', 'vatTreatment');
    set('defaultTaxRateId', 'defaultTaxRateId');
    set('hasSize', 'hasSize');
    set('hasColour', 'hasColour');
    set('trackSerial', 'trackSerial');
    set('trackExpiry', 'trackExpiry');
    set('imageUrls', 'imageUrls');
    set('isActive', 'isActive');

    try {
      const item = await this.clientFor(caller).item.update({
        where: { id },
        data,
      });
      return ItemResponseDto.fromEntity(item);
    } catch (error) {
      throw this.mapWriteError(
        error,
        dto.code ?? existing.code,
        existing.companyId,
      );
    }
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.getOwned(id, caller);
    await this.clientFor(caller).item.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // --- helpers -------------------------------------------------------------

  private async getOwned(id: string, caller: AuthenticatedUser) {
    const item = await this.clientFor(caller).item.findFirst({
      where: { id, deletedAt: null },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        message: `Item ${id} was not found.`,
        field: null,
      });
    }
    return item;
  }

  /**
   * Validate every FK the DTO sets belongs to the company, and that the
   * sales/purchase UoMs share the base UoM's category. `existing` supplies the
   * current base UoM on update when the DTO doesn't change it.
   */
  private async validateRefs(
    dto: CreateItemDto | UpdateItemDto,
    companyId: string,
    existing: { baseUomId?: string },
  ): Promise<void> {
    if (dto.categoryId)
      await this.assertLookup(
        'itemCategory',
        dto.categoryId,
        companyId,
        'categoryId',
      );
    if (dto.brandId)
      await this.assertLookup('brand', dto.brandId, companyId, 'brandId');
    if (dto.familyId)
      await this.assertLookup('family', dto.familyId, companyId, 'familyId');
    if (dto.priceCurrency) await this.assertCurrency(dto.priceCurrency);
    if (dto.defaultTaxRateId)
      await this.assertTaxRate(dto.defaultTaxRateId, companyId);

    const baseUomId = dto.baseUomId ?? existing.baseUomId;
    let baseCategoryId: string | undefined;
    if (baseUomId) {
      baseCategoryId = (await this.assertUom(baseUomId, companyId, 'baseUomId'))
        .categoryId;
    }
    for (const [field, uomId] of [
      ['salesUomId', dto.salesUomId],
      ['purchaseUomId', dto.purchaseUomId],
    ] as const) {
      if (uomId) {
        const uom = await this.assertUom(uomId, companyId, field);
        if (baseCategoryId && uom.categoryId !== baseCategoryId) {
          throw new BadRequestException({
            code: 'UOM_CATEGORY_MISMATCH',
            message: `${field} must be in the same UoM category as the base unit.`,
            field,
          });
        }
      }
    }
  }

  private async assertUom(
    id: string,
    companyId: string,
    field: string,
  ): Promise<{ categoryId: string }> {
    const uom = await this.prisma.uom.findFirst({
      where: { id, companyId },
      select: { categoryId: true },
    });
    if (!uom) {
      throw new NotFoundException({
        code: 'UOM_NOT_FOUND',
        message: `Unit of measure ${id} was not found in this company.`,
        field,
      });
    }
    return uom;
  }

  private async assertLookup(
    model: 'itemCategory' | 'brand' | 'family',
    id: string,
    companyId: string,
    field: string,
  ): Promise<void> {
    const delegate = (
      this.prisma as unknown as Record<
        string,
        { findFirst(a: { where: Record<string, unknown> }): Promise<unknown> }
      >
    )[model];
    const row = await delegate.findFirst({ where: { id, companyId } });
    if (!row) {
      throw new NotFoundException({
        code: 'LOOKUP_NOT_FOUND',
        message: `${field} ${id} was not found in this company.`,
        field,
      });
    }
  }

  private async assertCurrency(code: string): Promise<void> {
    const c = await this.prisma.currency.findUnique({ where: { code } });
    if (!c) {
      throw new NotFoundException({
        code: 'CURRENCY_NOT_FOUND',
        message: `Currency ${code} was not found.`,
        field: 'priceCurrency',
      });
    }
  }

  private async assertTaxRate(id: string, companyId: string): Promise<void> {
    const t = await this.prisma.taxRate.findFirst({ where: { id, companyId } });
    if (!t) {
      throw new NotFoundException({
        code: 'TAX_RATE_NOT_FOUND',
        message: `Tax rate ${id} was not found in this company.`,
        field: 'defaultTaxRateId',
      });
    }
  }

  private async baseCurrency(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { baseCurrencyCode: true },
    });
    return company?.baseCurrencyCode ?? 'USD';
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

  private mapWriteError(
    error: unknown,
    code: string,
    companyId?: string,
  ): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === PRISMA_UNIQUE) {
        return new ConflictException({
          code: 'ITEM_CODE_EXISTS',
          message: `An item with code ${code} already exists in this company.`,
          field: 'code',
        });
      }
      if (error.code === PRISMA_FK) {
        return new NotFoundException({
          code: 'COMPANY_NOT_FOUND',
          message: `Company ${companyId} was not found.`,
          field: 'companyId',
        });
      }
    }
    return error;
  }
}
