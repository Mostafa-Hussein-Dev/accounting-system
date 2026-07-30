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
import { CreateVariantDto } from './dto/variant.dto';
import { GenerateVariantsDto } from './dto/variant.dto';
import { UpdateVariantDto } from './dto/variant.dto';
import { GenerateResultDto, VariantResponseDto } from './dto/variant.dto';

const PRISMA_UNIQUE = 'P2002';

@Injectable()
export class VariantsService {
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
    itemId: string,
    dto: CreateVariantDto,
    caller: AuthenticatedUser,
  ): Promise<VariantResponseDto> {
    const item = await this.getItem(itemId, caller);
    if (!dto.sizeId && !dto.colourId) {
      throw new BadRequestException({
        code: 'VARIANT_ATTRIBUTE_REQUIRED',
        message: 'A variant must specify a size, a colour, or both.',
        field: 'sizeId',
      });
    }
    await this.assertAttributes(dto.sizeId, dto.colourId, item.companyId);

    // Explicit pre-checks: the DB unique index treats NULL size/colour as
    // distinct (so it misses null-attribute duplicates), and the driver adapter
    // doesn't reliably report which constraint a P2002 hit.
    const client = this.clientFor(caller);
    const dupCombo = await client.itemVariant.findFirst({
      where: {
        itemId,
        sizeId: dto.sizeId ?? null,
        colourId: dto.colourId ?? null,
      },
      select: { id: true },
    });
    if (dupCombo) {
      throw new ConflictException({
        code: 'VARIANT_COMBINATION_EXISTS',
        message:
          'A variant with this size/colour combination already exists on the item.',
        field: null,
      });
    }
    if (dto.sku) {
      const dupSku = await client.itemVariant.findFirst({
        where: { companyId: item.companyId, sku: dto.sku },
        select: { id: true },
      });
      if (dupSku) {
        throw new ConflictException({
          code: 'VARIANT_SKU_EXISTS',
          message: `SKU ${dto.sku} is already used in this company.`,
          field: 'sku',
        });
      }
    }

    try {
      const variant = await client.itemVariant.create({
        data: {
          companyId: item.companyId,
          itemId,
          sizeId: dto.sizeId ?? null,
          colourId: dto.colourId ?? null,
          sku: dto.sku ?? null,
        },
      });
      return VariantResponseDto.fromEntity(variant);
    } catch (error) {
      throw this.mapWriteError(error, dto.sku);
    }
  }

  async generate(
    itemId: string,
    dto: GenerateVariantsDto,
    caller: AuthenticatedUser,
  ): Promise<GenerateResultDto> {
    const item = await this.getItem(itemId, caller);
    const sizeIds = dto.sizeIds ?? [];
    const colourIds = dto.colourIds ?? [];
    if (sizeIds.length === 0 && colourIds.length === 0) {
      throw new BadRequestException({
        code: 'VARIANT_MATRIX_EMPTY',
        message: 'Provide at least one size or colour to generate variants.',
        field: 'sizeIds',
      });
    }
    for (const id of sizeIds)
      await this.assertLookup('size', id, item.companyId);
    for (const id of colourIds)
      await this.assertLookup('colour', id, item.companyId);

    // Cartesian product; a missing dimension contributes a single null.
    const sizes: (string | null)[] = sizeIds.length ? sizeIds : [null];
    const colours: (string | null)[] = colourIds.length ? colourIds : [null];
    const combos: { sizeId: string | null; colourId: string | null }[] = [];
    for (const s of sizes)
      for (const c of colours) combos.push({ sizeId: s, colourId: c });

    const existing = await this.clientFor(caller).itemVariant.findMany({
      where: { itemId },
      select: { sizeId: true, colourId: true },
    });
    const seen = new Set(
      existing.map((e) => `${e.sizeId ?? ''}|${e.colourId ?? ''}`),
    );
    const toCreate = combos.filter(
      (c) => !seen.has(`${c.sizeId ?? ''}|${c.colourId ?? ''}`),
    );

    if (toCreate.length > 0) {
      await this.clientFor(caller).itemVariant.createMany({
        data: toCreate.map((c) => ({
          companyId: item.companyId,
          itemId,
          sizeId: c.sizeId,
          colourId: c.colourId,
        })),
      });
    }
    return {
      created: toCreate.length,
      skipped: combos.length - toCreate.length,
    };
  }

  async findAll(
    itemId: string,
    caller: AuthenticatedUser,
  ): Promise<VariantResponseDto[]> {
    await this.getItem(itemId, caller);
    const rows = await this.clientFor(caller).itemVariant.findMany({
      where: { itemId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(VariantResponseDto.fromEntity);
  }

  async update(
    itemId: string,
    variantId: string,
    dto: UpdateVariantDto,
    caller: AuthenticatedUser,
  ): Promise<VariantResponseDto> {
    await this.getVariant(itemId, variantId, caller);
    try {
      const variant = await this.clientFor(caller).itemVariant.update({
        where: { id: variantId },
        data: {
          ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      return VariantResponseDto.fromEntity(variant);
    } catch (error) {
      throw this.mapWriteError(error, dto.sku);
    }
  }

  async remove(
    itemId: string,
    variantId: string,
    caller: AuthenticatedUser,
  ): Promise<void> {
    await this.getVariant(itemId, variantId, caller);
    await this.clientFor(caller).itemVariant.delete({
      where: { id: variantId },
    });
  }

  // --- helpers -------------------------------------------------------------

  private async getItem(itemId: string, caller: AuthenticatedUser) {
    const item = await this.clientFor(caller).item.findFirst({
      where: { id: itemId, deletedAt: null },
      select: { id: true, companyId: true },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        message: `Item ${itemId} was not found.`,
        field: null,
      });
    }
    return item;
  }

  private async getVariant(
    itemId: string,
    variantId: string,
    caller: AuthenticatedUser,
  ) {
    const variant = await this.clientFor(caller).itemVariant.findFirst({
      where: { id: variantId, itemId },
    });
    if (!variant) {
      throw new NotFoundException({
        code: 'VARIANT_NOT_FOUND',
        message: `Variant ${variantId} was not found on this item.`,
        field: null,
      });
    }
    return variant;
  }

  private async assertAttributes(
    sizeId: string | undefined,
    colourId: string | undefined,
    companyId: string,
  ): Promise<void> {
    if (sizeId) await this.assertLookup('size', sizeId, companyId);
    if (colourId) await this.assertLookup('colour', colourId, companyId);
  }

  private async assertLookup(
    model: 'size' | 'colour',
    id: string,
    companyId: string,
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
        message: `${model} ${id} was not found in this company.`,
        field: `${model}Id`,
      });
    }
  }

  private mapWriteError(error: unknown, sku?: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE
    ) {
      const target = error.meta?.target;
      const isSku = Array.isArray(target)
        ? target.includes('sku')
        : typeof target === 'string' && target.includes('sku');
      return new ConflictException(
        isSku
          ? {
              code: 'VARIANT_SKU_EXISTS',
              message: `SKU ${sku} is already used in this company.`,
              field: 'sku',
            }
          : {
              code: 'VARIANT_COMBINATION_EXISTS',
              message:
                'A variant with this size/colour combination already exists on the item.',
              field: null,
            },
      );
    }
    return error;
  }
}
