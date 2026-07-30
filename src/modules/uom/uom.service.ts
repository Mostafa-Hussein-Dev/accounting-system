import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UomType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CreateUomCategoryDto,
  UpdateUomCategoryDto,
  UomCategoryResponseDto,
} from './dto/uom-category.dto';
import {
  ConvertUomDto,
  ConvertUomResponseDto,
  CreateUomDto,
  UomResponseDto,
  UpdateUomDto,
} from './dto/uom.dto';

const PRISMA_UNIQUE = 'P2002';

@Injectable()
export class UomService {
  constructor(private readonly prisma: PrismaService) {}

  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) {
      return this.prisma;
    }
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  private companyId(
    dtoCompanyId: string | undefined,
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
    if (!dtoCompanyId) {
      throw new BadRequestException({
        code: 'COMPANY_ID_REQUIRED',
        message: 'A platform admin must specify companyId.',
        field: 'companyId',
      });
    }
    return dtoCompanyId;
  }

  // --- categories ----------------------------------------------------------

  async createCategory(
    dto: CreateUomCategoryDto,
    caller: AuthenticatedUser,
  ): Promise<UomCategoryResponseDto> {
    const companyId = this.companyId(dto.companyId, caller);
    try {
      const row = await this.clientFor(caller).uomCategory.create({
        data: {
          companyId,
          name: dto.name,
          nameAr: dto.nameAr ?? null,
          nameFr: dto.nameFr ?? null,
          nameEn: dto.nameEn ?? null,
        },
      });
      return UomCategoryResponseDto.fromEntity(row);
    } catch (error) {
      throw this.mapName(error, dto.name, 'UOM_CATEGORY_NAME_EXISTS');
    }
  }

  async findAllCategories(
    caller: AuthenticatedUser,
    companyId?: string,
  ): Promise<UomCategoryResponseDto[]> {
    const where: Prisma.UomCategoryWhereInput = {};
    if (companyId) where.companyId = companyId;
    const rows = await this.clientFor(caller).uomCategory.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return rows.map(UomCategoryResponseDto.fromEntity);
  }

  async findCategory(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<UomCategoryResponseDto> {
    return UomCategoryResponseDto.fromEntity(
      await this.getCategory(id, caller),
    );
  }

  async updateCategory(
    id: string,
    dto: UpdateUomCategoryDto,
    caller: AuthenticatedUser,
  ): Promise<UomCategoryResponseDto> {
    await this.getCategory(id, caller);
    try {
      const row = await this.clientFor(caller).uomCategory.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.nameFr !== undefined ? { nameFr: dto.nameFr } : {}),
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        },
      });
      return UomCategoryResponseDto.fromEntity(row);
    } catch (error) {
      throw this.mapName(error, dto.name ?? '', 'UOM_CATEGORY_NAME_EXISTS');
    }
  }

  async removeCategory(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.getCategory(id, caller);
    const units = await this.clientFor(caller).uom.count({
      where: { categoryId: id },
    });
    if (units > 0) {
      throw new ConflictException({
        code: 'UOM_CATEGORY_IN_USE',
        message: `This category has ${units} unit(s); delete or move them first.`,
        field: null,
      });
    }
    await this.clientFor(caller).uomCategory.delete({ where: { id } });
  }

  // --- units ---------------------------------------------------------------

  async createUom(
    dto: CreateUomDto,
    caller: AuthenticatedUser,
  ): Promise<UomResponseDto> {
    const companyId = this.companyId(dto.companyId, caller);
    await this.assertCategory(dto.categoryId, companyId);
    const factor = await this.resolveFactor(
      dto.type,
      dto.factor,
      dto.categoryId,
      companyId,
      null,
    );
    try {
      const row = await this.clientFor(caller).uom.create({
        data: {
          companyId,
          categoryId: dto.categoryId,
          name: dto.name,
          nameAr: dto.nameAr ?? null,
          nameFr: dto.nameFr ?? null,
          nameEn: dto.nameEn ?? null,
          type: dto.type,
          factor,
          rounding: dto.rounding ?? 0.01,
          isActive: dto.isActive ?? true,
        },
      });
      return UomResponseDto.fromEntity(row);
    } catch (error) {
      throw this.mapName(error, dto.name, 'UOM_NAME_EXISTS');
    }
  }

  async findAllUoms(
    caller: AuthenticatedUser,
    categoryId?: string,
    companyId?: string,
  ): Promise<UomResponseDto[]> {
    const where: Prisma.UomWhereInput = {};
    if (categoryId) where.categoryId = categoryId;
    if (companyId) where.companyId = companyId;
    const rows = await this.clientFor(caller).uom.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return rows.map(UomResponseDto.fromEntity);
  }

  async findUom(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<UomResponseDto> {
    return UomResponseDto.fromEntity(await this.getUom(id, caller));
  }

  async updateUom(
    id: string,
    dto: UpdateUomDto,
    caller: AuthenticatedUser,
  ): Promise<UomResponseDto> {
    const existing = await this.getUom(id, caller);
    const type = dto.type ?? existing.type;
    const factor =
      dto.type !== undefined || dto.factor !== undefined
        ? await this.resolveFactor(
            type,
            dto.factor ?? Number(existing.factor),
            existing.categoryId,
            existing.companyId,
            id,
          )
        : undefined;
    try {
      const row = await this.clientFor(caller).uom.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
          ...(dto.nameFr !== undefined ? { nameFr: dto.nameFr } : {}),
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(factor !== undefined ? { factor } : {}),
          ...(dto.rounding !== undefined ? { rounding: dto.rounding } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      return UomResponseDto.fromEntity(row);
    } catch (error) {
      throw this.mapName(error, dto.name ?? '', 'UOM_NAME_EXISTS');
    }
  }

  async removeUom(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.getUom(id, caller);
    await this.clientFor(caller).uom.delete({ where: { id } });
  }

  async convert(
    dto: ConvertUomDto,
    caller: AuthenticatedUser,
  ): Promise<ConvertUomResponseDto> {
    const from = await this.getUom(dto.fromUomId, caller);
    const to = await this.getUom(dto.toUomId, caller);
    if (from.categoryId !== to.categoryId) {
      throw new BadRequestException({
        code: 'UOM_CATEGORY_MISMATCH',
        message: 'Cannot convert between units of different categories.',
        field: 'toUomId',
      });
    }
    const raw = (dto.qty * Number(from.factor)) / Number(to.factor);
    const rounding = Number(to.rounding) || 0.000001;
    const result = Math.round(raw / rounding) * rounding;
    return {
      qty: dto.qty,
      fromUomId: from.id,
      toUomId: to.id,
      result: Math.round(result * 1e6) / 1e6,
    };
  }

  // --- helpers -------------------------------------------------------------

  private async getCategory(id: string, caller: AuthenticatedUser) {
    const row = await this.clientFor(caller).uomCategory.findFirst({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'UOM_CATEGORY_NOT_FOUND',
        message: `UoM category ${id} was not found.`,
        field: null,
      });
    }
    return row;
  }

  private async getUom(id: string, caller: AuthenticatedUser) {
    const row = await this.clientFor(caller).uom.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: 'UOM_NOT_FOUND',
        message: `UoM ${id} was not found.`,
        field: null,
      });
    }
    return row;
  }

  private async assertCategory(
    categoryId: string,
    companyId: string,
  ): Promise<void> {
    const row = await this.prisma.uomCategory.findFirst({
      where: { id: categoryId, companyId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'UOM_CATEGORY_NOT_FOUND',
        message: `UoM category ${categoryId} was not found in this company.`,
        field: 'categoryId',
      });
    }
  }

  /**
   * A REFERENCE unit always has factor 1, and a category may have at most one.
   * A BIGGER/SMALLER unit needs an explicit positive factor.
   */
  private async resolveFactor(
    type: UomType,
    factor: number | undefined,
    categoryId: string,
    companyId: string,
    excludeUomId: string | null,
  ): Promise<number> {
    if (type === UomType.REFERENCE) {
      const other = await this.prisma.uom.findFirst({
        where: {
          categoryId,
          companyId,
          type: UomType.REFERENCE,
          ...(excludeUomId ? { id: { not: excludeUomId } } : {}),
        },
      });
      if (other) {
        throw new ConflictException({
          code: 'UOM_REFERENCE_EXISTS',
          message: 'This category already has a reference unit.',
          field: 'type',
        });
      }
      return 1;
    }
    if (factor === undefined) {
      throw new BadRequestException({
        code: 'UOM_FACTOR_REQUIRED',
        message: 'A non-reference unit requires a factor.',
        field: 'factor',
      });
    }
    return factor;
  }

  private mapName(error: unknown, name: string, code: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE
    ) {
      return new ConflictException({
        code,
        message: `The name "${name}" is already used in this company.`,
        field: 'name',
      });
    }
    return error;
  }
}
