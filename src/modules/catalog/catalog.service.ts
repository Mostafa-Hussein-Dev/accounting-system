import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CreateCategoryDto,
  CreateLookupDto,
  LookupResponseDto,
  UpdateCategoryDto,
  UpdateLookupDto,
} from './dto/lookup.dto';

export type LookupKind =
  'brand' | 'family' | 'size' | 'colour' | 'itemCategory';

interface LookupRow {
  id: string;
  companyId: string;
  name: string;
  nameAr: string | null;
  nameFr: string | null;
  nameEn: string | null;
  sortOrder: number;
  parentId?: string | null;
  revenueAccountId?: string | null;
  cogsAccountId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// The subset of a Prisma model delegate the generic CRUD needs. Every lookup
// delegate satisfies this structurally.
interface LookupDelegate {
  create(args: { data: Record<string, unknown> }): Promise<LookupRow>;
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: unknown;
  }): Promise<LookupRow[]>;
  findFirst(args: {
    where: Record<string, unknown>;
  }): Promise<LookupRow | null>;
  update(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<LookupRow>;
  delete(args: { where: Record<string, unknown> }): Promise<LookupRow>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
}

const PRISMA_UNIQUE = 'P2002';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private client(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) {
      return this.prisma;
    }
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  private delegate(
    kind: LookupKind,
    caller: AuthenticatedUser,
  ): LookupDelegate {
    return (this.client(caller) as unknown as Record<string, LookupDelegate>)[
      kind
    ];
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

  async create(
    kind: LookupKind,
    dto: CreateLookupDto | CreateCategoryDto,
    caller: AuthenticatedUser,
  ): Promise<LookupResponseDto> {
    const companyId = this.companyId(dto.companyId, caller);
    const data: Record<string, unknown> = {
      companyId,
      name: dto.name,
      nameAr: dto.nameAr ?? null,
      nameFr: dto.nameFr ?? null,
      nameEn: dto.nameEn ?? null,
      sortOrder: dto.sortOrder ?? 0,
    };
    if (kind === 'itemCategory') {
      const parentId = (dto as CreateCategoryDto).parentId;
      if (parentId) {
        await this.assertCategory(parentId, companyId, caller);
      }
      data.parentId = parentId ?? null;
      data.revenueAccountId =
        (dto as CreateCategoryDto).revenueAccountId ?? null;
      data.cogsAccountId = (dto as CreateCategoryDto).cogsAccountId ?? null;
    }
    try {
      const row = await this.delegate(kind, caller).create({ data });
      return this.toDto(row, kind);
    } catch (error) {
      throw this.mapUnique(error, dto.name, kind);
    }
  }

  async findAll(
    kind: LookupKind,
    caller: AuthenticatedUser,
    companyId?: string,
  ): Promise<LookupResponseDto[]> {
    const where: Record<string, unknown> = {};
    if (companyId) where.companyId = companyId;
    const rows = await this.delegate(kind, caller).findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.toDto(r, kind));
  }

  async findOne(
    kind: LookupKind,
    id: string,
    caller: AuthenticatedUser,
  ): Promise<LookupResponseDto> {
    return this.toDto(await this.getOwned(kind, id, caller), kind);
  }

  async update(
    kind: LookupKind,
    id: string,
    dto: UpdateLookupDto | UpdateCategoryDto,
    caller: AuthenticatedUser,
  ): Promise<LookupResponseDto> {
    const existing = await this.getOwned(kind, id, caller);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr;
    if (dto.nameFr !== undefined) data.nameFr = dto.nameFr;
    if (dto.nameEn !== undefined) data.nameEn = dto.nameEn;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (kind === 'itemCategory') {
      const parentId = (dto as UpdateCategoryDto).parentId;
      if (parentId !== undefined) {
        if (parentId) {
          await this.assertCategory(parentId, existing.companyId, caller);
          await this.assertNoCycle(id, parentId, caller);
        }
        data.parentId = parentId;
      }
      const revenueAccountId = (dto as UpdateCategoryDto).revenueAccountId;
      if (revenueAccountId !== undefined)
        data.revenueAccountId = revenueAccountId;
      const cogsAccountId = (dto as UpdateCategoryDto).cogsAccountId;
      if (cogsAccountId !== undefined) data.cogsAccountId = cogsAccountId;
    }
    try {
      const row = await this.delegate(kind, caller).update({
        where: { id },
        data,
      });
      return this.toDto(row, kind);
    } catch (error) {
      throw this.mapUnique(error, dto.name ?? '', kind);
    }
  }

  async remove(
    kind: LookupKind,
    id: string,
    caller: AuthenticatedUser,
  ): Promise<void> {
    await this.getOwned(kind, id, caller);
    if (kind === 'itemCategory') {
      const children = await this.delegate(kind, caller).count({
        where: { parentId: id },
      });
      if (children > 0) {
        throw new ConflictException({
          code: 'CATEGORY_HAS_CHILDREN',
          message: `This category has ${children} child categor(y/ies); re-parent or delete them first.`,
          field: null,
        });
      }
    }
    await this.delegate(kind, caller).delete({ where: { id } });
  }

  // --- helpers -------------------------------------------------------------

  private async getOwned(
    kind: LookupKind,
    id: string,
    caller: AuthenticatedUser,
  ): Promise<LookupRow> {
    const row = await this.delegate(kind, caller).findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: 'LOOKUP_NOT_FOUND',
        message: `${kind} ${id} was not found.`,
        field: null,
      });
    }
    return row;
  }

  private async assertCategory(
    parentId: string,
    companyId: string,
    caller: AuthenticatedUser,
  ): Promise<void> {
    const row = await this.delegate('itemCategory', caller).findFirst({
      where: { id: parentId, companyId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'PARENT_CATEGORY_NOT_FOUND',
        message: `Parent category ${parentId} was not found in this company.`,
        field: 'parentId',
      });
    }
  }

  private async assertNoCycle(
    id: string,
    parentId: string,
    caller: AuthenticatedUser,
  ): Promise<void> {
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === id) {
        throw new BadRequestException({
          code: 'CATEGORY_CYCLE',
          message: 'A category cannot be its own ancestor.',
          field: 'parentId',
        });
      }
      const row: LookupRow | null = await this.delegate(
        'itemCategory',
        caller,
      ).findFirst({ where: { id: cursor } });
      cursor = row?.parentId ?? null;
    }
  }

  private toDto(row: LookupRow, kind: LookupKind): LookupResponseDto {
    const dto = new LookupResponseDto();
    dto.id = row.id;
    dto.companyId = row.companyId;
    dto.name = row.name;
    dto.nameAr = row.nameAr;
    dto.nameFr = row.nameFr;
    dto.nameEn = row.nameEn;
    dto.sortOrder = row.sortOrder;
    dto.createdAt = row.createdAt;
    dto.updatedAt = row.updatedAt;
    if (kind === 'itemCategory') {
      dto.parentId = row.parentId ?? null;
      dto.revenueAccountId = row.revenueAccountId ?? null;
      dto.cogsAccountId = row.cogsAccountId ?? null;
    }
    return dto;
  }

  private mapUnique(error: unknown, name: string, kind: LookupKind): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE
    ) {
      return new ConflictException({
        code: 'LOOKUP_NAME_EXISTS',
        message: `A ${kind} named "${name}" already exists in this company.`,
        field: 'name',
      });
    }
    return error;
  }
}
