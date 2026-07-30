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
  CreatePricelistDto,
  PricelistResponseDto,
  UpdatePricelistDto,
} from './dto/pricelist.dto';
import {
  CreatePricelistLineDto,
  PricelistLineResponseDto,
  ResolvedPriceDto,
  UpdatePricelistLineDto,
} from './dto/pricelist-line.dto';

const PRISMA_UNIQUE = 'P2002';

@Injectable()
export class PricingService {
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
    dto: string | undefined,
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
    if (!dto) {
      throw new BadRequestException({
        code: 'COMPANY_ID_REQUIRED',
        message: 'A platform admin must specify companyId.',
        field: 'companyId',
      });
    }
    return dto;
  }

  // --- pricelists ----------------------------------------------------------

  async create(
    dto: CreatePricelistDto,
    caller: AuthenticatedUser,
  ): Promise<PricelistResponseDto> {
    const companyId = this.companyId(dto.companyId, caller);
    await this.assertCurrency(dto.currencyCode);
    const client = this.clientFor(caller);
    try {
      const list = await client.$transaction(async (tx) => {
        if (dto.isDefault) {
          await tx.pricelist.updateMany({
            where: { companyId, isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.pricelist.create({
          data: {
            companyId,
            name: dto.name,
            currencyCode: dto.currencyCode,
            isDefault: dto.isDefault ?? false,
            isActive: dto.isActive ?? true,
          },
        });
      });
      return PricelistResponseDto.fromEntity(list);
    } catch (error) {
      throw this.mapName(error, dto.name);
    }
  }

  async findAll(
    caller: AuthenticatedUser,
    companyId?: string,
  ): Promise<PricelistResponseDto[]> {
    const where: Prisma.PricelistWhereInput = {};
    if (companyId) where.companyId = companyId;
    const rows = await this.clientFor(caller).pricelist.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return rows.map(PricelistResponseDto.fromEntity);
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<PricelistResponseDto> {
    return PricelistResponseDto.fromEntity(await this.getList(id, caller));
  }

  async update(
    id: string,
    dto: UpdatePricelistDto,
    caller: AuthenticatedUser,
  ): Promise<PricelistResponseDto> {
    const existing = await this.getList(id, caller);
    if (dto.currencyCode) await this.assertCurrency(dto.currencyCode);
    const client = this.clientFor(caller);
    try {
      const list = await client.$transaction(async (tx) => {
        if (dto.isDefault === true) {
          await tx.pricelist.updateMany({
            where: {
              companyId: existing.companyId,
              isDefault: true,
              id: { not: id },
            },
            data: { isDefault: false },
          });
        }
        return tx.pricelist.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.currencyCode !== undefined
              ? { currencyCode: dto.currencyCode }
              : {}),
            ...(dto.isDefault !== undefined
              ? { isDefault: dto.isDefault }
              : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });
      });
      return PricelistResponseDto.fromEntity(list);
    } catch (error) {
      throw this.mapName(error, dto.name ?? existing.name);
    }
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.getList(id, caller);
    await this.clientFor(caller).pricelist.delete({ where: { id } });
  }

  // --- lines ---------------------------------------------------------------

  async addLine(
    pricelistId: string,
    dto: CreatePricelistLineDto,
    caller: AuthenticatedUser,
  ): Promise<PricelistLineResponseDto> {
    const list = await this.getList(pricelistId, caller);
    await this.assertItem(dto.itemId, list.companyId);
    if (dto.variantId) await this.assertVariant(dto.variantId, dto.itemId);

    // Explicit pre-check (the unique index treats a NULL variantId as distinct).
    const dup = await this.clientFor(caller).pricelistLine.findFirst({
      where: {
        pricelistId,
        itemId: dto.itemId,
        variantId: dto.variantId ?? null,
        minQty: dto.minQty ?? 1,
      },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException({
        code: 'PRICELIST_LINE_EXISTS',
        message:
          'A price for this item/variant at this minimum quantity already exists in the list.',
        field: null,
      });
    }
    try {
      const line = await this.clientFor(caller).pricelistLine.create({
        data: {
          companyId: list.companyId,
          pricelistId,
          itemId: dto.itemId,
          variantId: dto.variantId ?? null,
          price: dto.price,
          minQty: dto.minQty ?? 1,
        },
      });
      return PricelistLineResponseDto.fromEntity(line);
    } catch (error) {
      throw this.mapLineUnique(error);
    }
  }

  async listLines(
    pricelistId: string,
    caller: AuthenticatedUser,
  ): Promise<PricelistLineResponseDto[]> {
    await this.getList(pricelistId, caller);
    const rows = await this.clientFor(caller).pricelistLine.findMany({
      where: { pricelistId },
      orderBy: [{ itemId: 'asc' }, { minQty: 'asc' }],
    });
    return rows.map(PricelistLineResponseDto.fromEntity);
  }

  async updateLine(
    pricelistId: string,
    lineId: string,
    dto: UpdatePricelistLineDto,
    caller: AuthenticatedUser,
  ): Promise<PricelistLineResponseDto> {
    await this.getLine(pricelistId, lineId, caller);
    try {
      const line = await this.clientFor(caller).pricelistLine.update({
        where: { id: lineId },
        data: {
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.minQty !== undefined ? { minQty: dto.minQty } : {}),
        },
      });
      return PricelistLineResponseDto.fromEntity(line);
    } catch (error) {
      throw this.mapLineUnique(error);
    }
  }

  async removeLine(
    pricelistId: string,
    lineId: string,
    caller: AuthenticatedUser,
  ): Promise<void> {
    await this.getLine(pricelistId, lineId, caller);
    await this.clientFor(caller).pricelistLine.delete({
      where: { id: lineId },
    });
  }

  // --- price resolution ----------------------------------------------------

  async resolvePrice(
    itemId: string,
    caller: AuthenticatedUser,
    opts: { pricelistId?: string; variantId?: string; qty?: number },
  ): Promise<ResolvedPriceDto> {
    const client = this.clientFor(caller);
    const item = await client.item.findFirst({
      where: { id: itemId, deletedAt: null },
      select: { id: true, salePrice: true, priceCurrency: true },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        message: `Item ${itemId} was not found.`,
        field: null,
      });
    }
    const qty = opts.qty && opts.qty > 0 ? opts.qty : 1;

    const pricelist = opts.pricelistId
      ? await this.getList(opts.pricelistId, caller)
      : await client.pricelist.findFirst({
          where: { isDefault: true, isActive: true },
        });

    if (pricelist) {
      const lines = await client.pricelistLine.findMany({
        where: {
          pricelistId: pricelist.id,
          itemId,
          minQty: { lte: qty },
          OR: [{ variantId: opts.variantId ?? null }, { variantId: null }],
        },
      });
      // Prefer a variant-specific line, then the highest applicable qty break.
      const best = lines.sort((a, b) => {
        const av = a.variantId ? 1 : 0;
        const bv = b.variantId ? 1 : 0;
        if (av !== bv) return bv - av;
        return Number(b.minQty) - Number(a.minQty);
      })[0];
      if (best) {
        return {
          itemId,
          variantId: opts.variantId ?? null,
          qty,
          price: Number(best.price),
          currency: pricelist.currencyCode,
          source: 'pricelist',
          pricelistId: pricelist.id,
        };
      }
    }

    return {
      itemId,
      variantId: opts.variantId ?? null,
      qty,
      price: Number(item.salePrice),
      currency: item.priceCurrency,
      source: 'item',
      pricelistId: null,
    };
  }

  // --- helpers -------------------------------------------------------------

  private async getList(id: string, caller: AuthenticatedUser) {
    const list = await this.clientFor(caller).pricelist.findFirst({
      where: { id },
    });
    if (!list) {
      throw new NotFoundException({
        code: 'PRICELIST_NOT_FOUND',
        message: `Pricelist ${id} was not found.`,
        field: null,
      });
    }
    return list;
  }

  private async getLine(
    pricelistId: string,
    lineId: string,
    caller: AuthenticatedUser,
  ) {
    await this.getList(pricelistId, caller);
    const line = await this.clientFor(caller).pricelistLine.findFirst({
      where: { id: lineId, pricelistId },
    });
    if (!line) {
      throw new NotFoundException({
        code: 'PRICELIST_LINE_NOT_FOUND',
        message: `Pricelist line ${lineId} was not found.`,
        field: null,
      });
    }
    return line;
  }

  private async assertCurrency(code: string): Promise<void> {
    const c = await this.prisma.currency.findUnique({ where: { code } });
    if (!c) {
      throw new NotFoundException({
        code: 'CURRENCY_NOT_FOUND',
        message: `Currency ${code} was not found.`,
        field: 'currencyCode',
      });
    }
  }

  private async assertItem(itemId: string, companyId: string): Promise<void> {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        message: `Item ${itemId} was not found in this company.`,
        field: 'itemId',
      });
    }
  }

  private async assertVariant(
    variantId: string,
    itemId: string,
  ): Promise<void> {
    const v = await this.prisma.itemVariant.findFirst({
      where: { id: variantId, itemId },
      select: { id: true },
    });
    if (!v) {
      throw new NotFoundException({
        code: 'VARIANT_NOT_FOUND',
        message: `Variant ${variantId} was not found on this item.`,
        field: 'variantId',
      });
    }
  }

  private mapName(error: unknown, name: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE
    ) {
      return new ConflictException({
        code: 'PRICELIST_NAME_EXISTS',
        message: `A pricelist named "${name}" already exists in this company.`,
        field: 'name',
      });
    }
    return error;
  }

  private mapLineUnique(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE
    ) {
      return new ConflictException({
        code: 'PRICELIST_LINE_EXISTS',
        message:
          'A price for this item/variant at this minimum quantity already exists in the list.',
        field: null,
      });
    }
    return error;
  }
}
