import {
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
  BarcodeResponseDto,
  CreateBarcodeDto,
  UpdateBarcodeDto,
} from './dto/barcode.dto';

@Injectable()
export class BarcodesService {
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
    dto: CreateBarcodeDto,
    caller: AuthenticatedUser,
  ): Promise<BarcodeResponseDto> {
    const item = await this.getItem(itemId, caller);
    if (dto.variantId) await this.assertVariant(dto.variantId, itemId, caller);
    await this.assertBarcodeFree(dto.barcode, item.companyId, null, caller);

    const client = this.clientFor(caller);
    const barcode = await client.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.itemBarcode.updateMany({
          where: { itemId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.itemBarcode.create({
        data: {
          companyId: item.companyId,
          itemId,
          variantId: dto.variantId ?? null,
          barcode: dto.barcode,
          isPrimary: dto.isPrimary ?? false,
        },
      });
    });
    return BarcodeResponseDto.fromEntity(barcode);
  }

  async findAll(
    itemId: string,
    caller: AuthenticatedUser,
  ): Promise<BarcodeResponseDto[]> {
    await this.getItem(itemId, caller);
    const rows = await this.clientFor(caller).itemBarcode.findMany({
      where: { itemId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(BarcodeResponseDto.fromEntity);
  }

  async update(
    itemId: string,
    barcodeId: string,
    dto: UpdateBarcodeDto,
    caller: AuthenticatedUser,
  ): Promise<BarcodeResponseDto> {
    const existing = await this.getBarcode(itemId, barcodeId, caller);
    if (dto.barcode && dto.barcode !== existing.barcode) {
      await this.assertBarcodeFree(
        dto.barcode,
        existing.companyId,
        barcodeId,
        caller,
      );
    }
    const client = this.clientFor(caller);
    const updated = await client.$transaction(async (tx) => {
      if (dto.isPrimary === true) {
        await tx.itemBarcode.updateMany({
          where: { itemId, isPrimary: true, id: { not: barcodeId } },
          data: { isPrimary: false },
        });
      }
      return tx.itemBarcode.update({
        where: { id: barcodeId },
        data: {
          ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        },
      });
    });
    return BarcodeResponseDto.fromEntity(updated);
  }

  async remove(
    itemId: string,
    barcodeId: string,
    caller: AuthenticatedUser,
  ): Promise<void> {
    await this.getBarcode(itemId, barcodeId, caller);
    await this.clientFor(caller).itemBarcode.delete({
      where: { id: barcodeId },
    });
  }

  /** Resolve a scanned barcode to its item/variant within the caller's company. */
  async lookup(
    barcode: string,
    caller: AuthenticatedUser,
  ): Promise<BarcodeResponseDto> {
    const row = await this.clientFor(caller).itemBarcode.findFirst({
      where: { barcode },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'BARCODE_NOT_FOUND',
        message: `No item has the barcode ${barcode}.`,
        field: 'barcode',
      });
    }
    return BarcodeResponseDto.fromEntity(row);
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

  private async getBarcode(
    itemId: string,
    barcodeId: string,
    caller: AuthenticatedUser,
  ) {
    const row = await this.clientFor(caller).itemBarcode.findFirst({
      where: { id: barcodeId, itemId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'BARCODE_NOT_FOUND',
        message: `Barcode ${barcodeId} was not found on this item.`,
        field: null,
      });
    }
    return row;
  }

  private async assertVariant(
    variantId: string,
    itemId: string,
    caller: AuthenticatedUser,
  ): Promise<void> {
    const v = await this.clientFor(caller).itemVariant.findFirst({
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

  private async assertBarcodeFree(
    barcode: string,
    companyId: string,
    excludeId: string | null,
    caller: AuthenticatedUser,
  ): Promise<void> {
    const dup = await this.clientFor(caller).itemBarcode.findFirst({
      where: {
        companyId,
        barcode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException({
        code: 'BARCODE_EXISTS',
        message: `Barcode ${barcode} is already used in this company.`,
        field: 'barcode',
      });
    }
  }
}
