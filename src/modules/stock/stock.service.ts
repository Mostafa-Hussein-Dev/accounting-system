import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentType,
  Item,
  ItemVariant,
  Location,
  LocationType,
  Prisma,
  StockMovementType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import { SequencesService } from '../sequences/sequences.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CreateMovementDto,
  MovementResponseDto,
  QueryMovementDto,
} from './dto/stock-movement.dto';
import {
  ItemStockResponseDto,
  OnHandQueryDto,
  OnHandResponseDto,
  ValuationQueryDto,
  ValuationResponseDto,
  VariantStockDto,
} from './dto/stock-read.dto';

// The valuation direction a move implies, derived from the location TYPES (not
// the requested StockMovementType): stock entering the internal network from a
// virtual location gains value at a stated cost; leaving it is valued at the
// current moving average; internal→internal only relocates quantity.
type Direction = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequencesService,
  ) {}

  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) {
      return this.prisma;
    }
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  private resolveCompanyId(
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

  /**
   * Post one stock movement and its moving-average valuation, atomically.
   * The whole thing runs in a transaction that locks the item/variant
   * valuation row (SELECT ... FOR UPDATE) so concurrent movements on the same
   * stream serialize and can never corrupt the running average or on-hand.
   */
  async createMovement(
    dto: CreateMovementDto,
    caller: AuthenticatedUser,
  ): Promise<MovementResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const movementDate = this.parseDate(dto.movementDate);

    const created = await this.prisma.$transaction(async (tx) => {
      const item = await this.resolveItem(tx, dto.itemId, companyId);
      const variant = await this.resolveVariant(tx, item, dto.variantId);
      const from = await this.resolveLocation(
        tx,
        dto.fromLocationId,
        companyId,
      );
      const to = await this.resolveLocation(tx, dto.toLocationId, companyId);

      if (from.id === to.id) {
        throw new BadRequestException({
          code: 'MOVEMENT_SAME_LOCATION',
          message: 'Source and destination locations must differ.',
          field: 'toLocationId',
        });
      }
      const direction = this.classify(from.type, to.type);
      this.assertTypeMatchesDirection(dto.type, direction);

      const qty = await this.convertToBase(tx, item, dto.uomId, dto.qty);

      // Serialize concurrent movements on this valuation stream.
      await this.lockValuationRow(
        tx,
        variant ? 'item_variants' : 'items',
        variant?.id ?? item.id,
      );

      const oldQty = await this.streamOnHandTotal(
        tx,
        companyId,
        item.id,
        variant?.id ?? null,
      );
      const oldAvg = Number(variant ? variant.avgCost : item.avgCost);

      // Block driving an internal location negative (outbound / transfer-out).
      if (direction === 'OUTBOUND' || direction === 'INTERNAL') {
        const atFrom = await this.locationOnHand(
          tx,
          companyId,
          item.id,
          variant?.id ?? null,
          from.id,
        );
        if (qty > atFrom + 1e-9) {
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            message: `Only ${round(atFrom, 3)} on hand at ${from.code}; cannot move ${qty}.`,
            field: 'qty',
          });
        }
      }

      let unitCost: number;
      if (direction === 'INBOUND') {
        if (dto.unitCost === undefined) {
          throw new BadRequestException({
            code: 'UNIT_COST_REQUIRED',
            message:
              'An inbound movement (RECEIPT/OPENING/adjustment-in) requires unitCost.',
            field: 'unitCost',
          });
        }
        unitCost = round(dto.unitCost, 4);
        const denom = oldQty + qty;
        const newAvg =
          denom > 0
            ? round((oldQty * oldAvg + qty * unitCost) / denom, 4)
            : unitCost;
        await this.setAvg(tx, variant, item, newAvg);
      } else {
        // OUTBOUND / INTERNAL are valued at the current moving average.
        unitCost = round(oldAvg, 4);
      }
      const value = round(qty * unitCost, 4);

      const movementNo = await this.sequences.nextNumber(
        companyId,
        dto.branchId ?? null,
        DocumentType.STOCK_MOVEMENT,
        movementDate,
        tx,
      );

      return tx.stockMovement.create({
        data: {
          companyId,
          movementNo,
          type: dto.type,
          movementDate,
          itemId: item.id,
          variantId: variant?.id ?? null,
          fromLocationId: from.id,
          toLocationId: to.id,
          qty,
          unitCost,
          value,
          costCurrency: await this.baseCurrency(tx, companyId),
          reason: dto.reason ?? null,
          reference: dto.reference ?? null,
          branchId: dto.branchId ?? null,
          createdBy: caller.userId,
        },
      });
    });

    return MovementResponseDto.fromEntity(created);
  }

  async listMovements(
    query: QueryMovementDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<MovementResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.StockMovementWhereInput = {};
    if (query.companyId) where.companyId = query.companyId;
    if (query.itemId) where.itemId = query.itemId;
    if (query.variantId) where.variantId = query.variantId;
    if (query.type) where.type = query.type;
    if (query.locationId) {
      where.OR = [
        { fromLocationId: query.locationId },
        { toLocationId: query.locationId },
      ];
    }
    if (query.from || query.to) {
      where.movementDate = {};
      if (query.from) where.movementDate.gte = this.parseDate(query.from);
      if (query.to) where.movementDate.lte = this.parseDate(query.to);
    }
    const client = this.clientFor(caller);
    const [rows, total] = await this.prisma.$transaction([
      client.stockMovement.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
      }),
      client.stockMovement.count({ where }),
    ]);
    return Paginated.of(
      rows.map(MovementResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  // --- derived reads -------------------------------------------------------

  /** On-hand + valuation for a stream, company-wide or at one location. */
  async onHand(
    query: OnHandQueryDto,
    caller: AuthenticatedUser,
  ): Promise<OnHandResponseDto> {
    const companyId = this.resolveCompanyId(query.companyId, caller);
    const client = this.clientFor(caller);
    const item = await this.resolveItem(client, query.itemId, companyId);
    const variantId = query.variantId ?? null;
    const currency = await this.baseCurrency(client, companyId);

    let qty: number;
    let value: number;
    if (query.locationId) {
      qty = await this.locationOnHand(
        client,
        companyId,
        item.id,
        variantId,
        query.locationId,
      );
      value = await this.locationValueNet(
        client,
        companyId,
        item.id,
        variantId,
        query.locationId,
      );
    } else {
      qty = await this.streamOnHandTotal(client, companyId, item.id, variantId);
      value = await this.streamValueNet(client, companyId, item.id, variantId);
    }

    const cached = variantId
      ? await this.variantAvg(client, variantId)
      : Number(item.avgCost);
    const avgCost = qty > 0 ? round(value / qty, 4) : round(cached, 4);
    return {
      itemId: item.id,
      variantId,
      locationId: query.locationId ?? null,
      qty: round(qty, 3),
      avgCost,
      value: round(value, 4),
      currency,
    };
  }

  /** Per-variant, per-internal-location on-hand breakdown for an item. */
  async itemStock(
    itemId: string,
    caller: AuthenticatedUser,
    companyIdOverride?: string,
  ): Promise<ItemStockResponseDto> {
    const companyId = this.resolveCompanyId(companyIdOverride, caller);
    const client = this.clientFor(caller);
    const item = await this.resolveItem(client, itemId, companyId);
    const currency = await this.baseCurrency(client, companyId);

    const [inRows, outRows] = await Promise.all([
      client.stockMovement.groupBy({
        by: ['variantId', 'toLocationId'],
        _sum: { qty: true, value: true },
        where: {
          companyId,
          itemId: item.id,
          toLocation: { type: LocationType.INTERNAL },
        },
      }),
      client.stockMovement.groupBy({
        by: ['variantId', 'fromLocationId'],
        _sum: { qty: true, value: true },
        where: {
          companyId,
          itemId: item.id,
          fromLocation: { type: LocationType.INTERNAL },
        },
      }),
    ]);

    // Accumulate net qty/value per (variant, location).
    const cells = new Map<
      string,
      {
        variantId: string | null;
        locationId: string;
        qty: number;
        value: number;
      }
    >();
    const bump = (
      variantId: string | null,
      locationId: string,
      qty: number,
      value: number,
    ): void => {
      const key = `${variantId ?? '_'}|${locationId}`;
      const cell = cells.get(key) ?? {
        variantId,
        locationId,
        qty: 0,
        value: 0,
      };
      cell.qty += qty;
      cell.value += value;
      cells.set(key, cell);
    };
    for (const r of inRows) {
      bump(
        r.variantId,
        r.toLocationId,
        Number(r._sum.qty ?? 0),
        Number(r._sum.value ?? 0),
      );
    }
    for (const r of outRows) {
      bump(
        r.variantId,
        r.fromLocationId,
        -Number(r._sum.qty ?? 0),
        -Number(r._sum.value ?? 0),
      );
    }

    const locationCodes = await this.internalLocationCodes(client, companyId);
    const byVariant = new Map<string, VariantStockDto>();
    let totalQty = 0;
    let totalValue = 0;
    for (const cell of cells.values()) {
      if (round(cell.qty, 3) === 0 && round(cell.value, 4) === 0) continue;
      const vk = cell.variantId ?? '_';
      const v =
        byVariant.get(vk) ??
        ({
          variantId: cell.variantId,
          qty: 0,
          value: 0,
          locations: [],
        } as VariantStockDto);
      v.locations.push({
        locationId: cell.locationId,
        locationCode: locationCodes.get(cell.locationId) ?? cell.locationId,
        qty: round(cell.qty, 3),
        value: round(cell.value, 4),
      });
      v.qty = round(v.qty + cell.qty, 3);
      v.value = round(v.value + cell.value, 4);
      byVariant.set(vk, v);
      totalQty += cell.qty;
      totalValue += cell.value;
    }

    return {
      itemId: item.id,
      totalQty: round(totalQty, 3),
      totalValue: round(totalValue, 4),
      currency,
      breakdown: [...byVariant.values()],
    };
  }

  /** Total inventory value per item (and grand total) as of a date. */
  async valuation(
    query: ValuationQueryDto,
    caller: AuthenticatedUser,
  ): Promise<ValuationResponseDto> {
    const companyId = this.resolveCompanyId(query.companyId, caller);
    const client = this.clientFor(caller);
    const currency = await this.baseCurrency(client, companyId);
    const asOf = this.parseDate(query.asOf);
    const dateFilter = { movementDate: { lte: asOf } };

    const [inRows, outRows] = await Promise.all([
      client.stockMovement.groupBy({
        by: ['itemId'],
        _sum: { qty: true, value: true },
        where: {
          companyId,
          toLocation: { type: LocationType.INTERNAL },
          ...dateFilter,
        },
      }),
      client.stockMovement.groupBy({
        by: ['itemId'],
        _sum: { qty: true, value: true },
        where: {
          companyId,
          fromLocation: { type: LocationType.INTERNAL },
          ...dateFilter,
        },
      }),
    ]);

    const byItem = new Map<string, { qty: number; value: number }>();
    for (const r of inRows) {
      const cur = byItem.get(r.itemId) ?? { qty: 0, value: 0 };
      cur.qty += Number(r._sum.qty ?? 0);
      cur.value += Number(r._sum.value ?? 0);
      byItem.set(r.itemId, cur);
    }
    for (const r of outRows) {
      const cur = byItem.get(r.itemId) ?? { qty: 0, value: 0 };
      cur.qty -= Number(r._sum.qty ?? 0);
      cur.value -= Number(r._sum.value ?? 0);
      byItem.set(r.itemId, cur);
    }

    let totalValue = 0;
    const items = [...byItem.entries()]
      .map(([itemId, v]) => ({
        itemId,
        qty: round(v.qty, 3),
        value: round(v.value, 4),
      }))
      .filter((r) => r.qty !== 0 || r.value !== 0)
      .sort((a, b) => b.value - a.value);
    for (const r of items) totalValue += r.value;

    return {
      asOf: asOf.toISOString().slice(0, 10),
      totalValue: round(totalValue, 4),
      currency,
      items,
    };
  }

  // --- valuation / on-hand helpers -----------------------------------------

  /** Total on-hand for a stream across ALL internal locations (the AVCO base). */
  private async streamOnHandTotal(
    tx: Prisma.TransactionClient,
    companyId: string,
    itemId: string,
    variantId: string | null,
  ): Promise<number> {
    const stream = { companyId, itemId, variantId };
    const [inAgg, outAgg] = await Promise.all([
      tx.stockMovement.aggregate({
        _sum: { qty: true },
        where: { ...stream, toLocation: { type: LocationType.INTERNAL } },
      }),
      tx.stockMovement.aggregate({
        _sum: { qty: true },
        where: { ...stream, fromLocation: { type: LocationType.INTERNAL } },
      }),
    ]);
    return Number(inAgg._sum.qty ?? 0) - Number(outAgg._sum.qty ?? 0);
  }

  /** On-hand for a stream at one specific location. */
  private async locationOnHand(
    tx: Prisma.TransactionClient,
    companyId: string,
    itemId: string,
    variantId: string | null,
    locationId: string,
  ): Promise<number> {
    const stream = { companyId, itemId, variantId };
    const [inAgg, outAgg] = await Promise.all([
      tx.stockMovement.aggregate({
        _sum: { qty: true },
        where: { ...stream, toLocationId: locationId },
      }),
      tx.stockMovement.aggregate({
        _sum: { qty: true },
        where: { ...stream, fromLocationId: locationId },
      }),
    ]);
    return Number(inAgg._sum.qty ?? 0) - Number(outAgg._sum.qty ?? 0);
  }

  /** Net inventory value for a stream across internal locations (as-of optional). */
  private async streamValueNet(
    client: Prisma.TransactionClient,
    companyId: string,
    itemId: string,
    variantId: string | null,
  ): Promise<number> {
    const stream = { companyId, itemId, variantId };
    const [inAgg, outAgg] = await Promise.all([
      client.stockMovement.aggregate({
        _sum: { value: true },
        where: { ...stream, toLocation: { type: LocationType.INTERNAL } },
      }),
      client.stockMovement.aggregate({
        _sum: { value: true },
        where: { ...stream, fromLocation: { type: LocationType.INTERNAL } },
      }),
    ]);
    return Number(inAgg._sum.value ?? 0) - Number(outAgg._sum.value ?? 0);
  }

  /** Net inventory value for a stream at one specific location. */
  private async locationValueNet(
    client: Prisma.TransactionClient,
    companyId: string,
    itemId: string,
    variantId: string | null,
    locationId: string,
  ): Promise<number> {
    const stream = { companyId, itemId, variantId };
    const [inAgg, outAgg] = await Promise.all([
      client.stockMovement.aggregate({
        _sum: { value: true },
        where: { ...stream, toLocationId: locationId },
      }),
      client.stockMovement.aggregate({
        _sum: { value: true },
        where: { ...stream, fromLocationId: locationId },
      }),
    ]);
    return Number(inAgg._sum.value ?? 0) - Number(outAgg._sum.value ?? 0);
  }

  private async variantAvg(
    client: Prisma.TransactionClient,
    variantId: string,
  ): Promise<number> {
    const v = await client.itemVariant.findUnique({
      where: { id: variantId },
      select: { avgCost: true },
    });
    return Number(v?.avgCost ?? 0);
  }

  private async internalLocationCodes(
    client: Prisma.TransactionClient,
    companyId: string,
  ): Promise<Map<string, string>> {
    const rows = await client.location.findMany({
      where: { companyId, type: LocationType.INTERNAL },
      select: { id: true, code: true },
    });
    return new Map(rows.map((r) => [r.id, r.code]));
  }

  private async setAvg(
    tx: Prisma.TransactionClient,
    variant: ItemVariant | null,
    item: Item,
    avgCost: number,
  ): Promise<void> {
    if (variant) {
      await tx.itemVariant.update({
        where: { id: variant.id },
        data: { avgCost },
      });
    } else {
      await tx.item.update({ where: { id: item.id }, data: { avgCost } });
    }
  }

  private async lockValuationRow(
    tx: Prisma.TransactionClient,
    table: 'items' | 'item_variants',
    id: string,
  ): Promise<void> {
    // Raw so the row is locked FOR UPDATE for the rest of the transaction.
    if (table === 'items') {
      await tx.$queryRaw`SELECT id FROM items WHERE id = ${id}::uuid FOR UPDATE`;
    } else {
      await tx.$queryRaw`SELECT id FROM item_variants WHERE id = ${id}::uuid FOR UPDATE`;
    }
  }

  // --- reference resolution ------------------------------------------------

  private classify(fromType: LocationType, toType: LocationType): Direction {
    const fromInternal = fromType === LocationType.INTERNAL;
    const toInternal = toType === LocationType.INTERNAL;
    if (fromInternal && toInternal) return 'INTERNAL';
    if (!fromInternal && toInternal) return 'INBOUND';
    if (fromInternal && !toInternal) return 'OUTBOUND';
    throw new BadRequestException({
      code: 'MOVEMENT_INVALID_LOCATIONS',
      message:
        'A movement must touch at least one internal location (virtual→virtual is not allowed).',
      field: 'fromLocationId',
    });
  }

  private assertTypeMatchesDirection(
    type: StockMovementType,
    direction: Direction,
  ): void {
    const ok =
      (direction === 'INBOUND' &&
        (type === StockMovementType.RECEIPT ||
          type === StockMovementType.OPENING ||
          type === StockMovementType.ADJUSTMENT)) ||
      (direction === 'OUTBOUND' &&
        (type === StockMovementType.ISSUE ||
          type === StockMovementType.ADJUSTMENT)) ||
      (direction === 'INTERNAL' && type === StockMovementType.TRANSFER);
    if (!ok) {
      throw new BadRequestException({
        code: 'MOVEMENT_TYPE_MISMATCH',
        message: `A ${direction.toLowerCase()} movement cannot be typed ${type}.`,
        field: 'type',
      });
    }
  }

  private async resolveItem(
    tx: Prisma.TransactionClient,
    itemId: string,
    companyId: string,
  ): Promise<Item> {
    const item = await tx.item.findFirst({
      where: { id: itemId, companyId, deletedAt: null },
    });
    if (!item) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        message: `Item ${itemId} was not found in this company.`,
        field: 'itemId',
      });
    }
    return item;
  }

  private async resolveVariant(
    tx: Prisma.TransactionClient,
    item: Item,
    variantId: string | undefined,
  ): Promise<ItemVariant | null> {
    const needsVariant = item.hasSize || item.hasColour;
    if (needsVariant && !variantId) {
      throw new BadRequestException({
        code: 'VARIANT_REQUIRED_FOR_STOCK',
        message:
          'This item has variants; a variantId is required to move stock.',
        field: 'variantId',
      });
    }
    if (!needsVariant && variantId) {
      throw new BadRequestException({
        code: 'ITEM_HAS_NO_VARIANTS',
        message: 'This item has no variants; do not pass a variantId.',
        field: 'variantId',
      });
    }
    if (!variantId) return null;
    const variant = await tx.itemVariant.findFirst({
      where: { id: variantId, itemId: item.id },
    });
    if (!variant) {
      throw new NotFoundException({
        code: 'VARIANT_NOT_FOUND',
        message: `Variant ${variantId} was not found on this item.`,
        field: 'variantId',
      });
    }
    return variant;
  }

  private async resolveLocation(
    tx: Prisma.TransactionClient,
    id: string,
    companyId: string,
  ): Promise<Location> {
    const loc = await tx.location.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!loc) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: `Location ${id} was not found in this company.`,
        field: null,
      });
    }
    return loc;
  }

  /** Convert an input quantity to the item base UoM (same-category enforced). */
  private async convertToBase(
    tx: Prisma.TransactionClient,
    item: Item,
    uomId: string | undefined,
    qty: number,
  ): Promise<number> {
    if (!uomId || uomId === item.baseUomId) {
      return round(qty, 3);
    }
    const [from, base] = await Promise.all([
      tx.uom.findFirst({ where: { id: uomId, companyId: item.companyId } }),
      tx.uom.findFirst({ where: { id: item.baseUomId } }),
    ]);
    if (!from) {
      throw new NotFoundException({
        code: 'UOM_NOT_FOUND',
        message: `UoM ${uomId} was not found in this company.`,
        field: 'uomId',
      });
    }
    if (!base || from.categoryId !== base.categoryId) {
      throw new BadRequestException({
        code: 'UOM_CATEGORY_MISMATCH',
        message:
          'The input UoM is not in the same category as the item base UoM.',
        field: 'uomId',
      });
    }
    return round((qty * Number(from.factor)) / Number(base.factor), 3);
  }

  private async baseCurrency(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<string> {
    const company = await tx.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { baseCurrencyCode: true },
    });
    return company.baseCurrencyCode;
  }

  private parseDate(value: string | undefined): Date {
    if (!value) return new Date();
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `"${value}" is not a valid date.`,
        field: 'movementDate',
      });
    }
    return d;
  }
}
