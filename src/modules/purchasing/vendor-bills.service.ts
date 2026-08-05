import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ControlType,
  DocumentType,
  JournalSide,
  JournalStatus,
  Prisma,
  PurchaseOrderStatus,
  TaxTreatment,
  VendorBillStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import { SequencesService } from '../sequences/sequences.service';
import { AuditService } from '../audit/audit.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CreateVendorBillDto,
  QueryVendorBillDto,
  VendorBillResponseDto,
} from './dto/vendor-bill.dto';
import { computeLine, computeTotals, toDecimal } from './purchasing.money';
import { resolveRate } from './purchasing.rate';
import { toVendorBillResponse, VB_INCLUDE } from './purchasing.mappers';

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

interface BuiltBillLine {
  itemId: string;
  variantId: string | null;
  uomId: string;
  purchaseOrderLineId: string | null;
  qty: number;
  unitCost: number;
  taxRateId: string | null;
  vatInAccountId: string | null;
  vatTreatment: TaxTreatment;
  ratePct: number;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  description: string | null;
}

@Injectable()
export class VendorBillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequencesService,
    private readonly audit: AuditService,
  ) {}

  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) return this.prisma;
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
          message: 'No active company selected.',
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
    dto: CreateVendorBillDto,
    caller: AuthenticatedUser,
  ): Promise<VendorBillResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const billDate = this.parseDate(dto.billDate, 'billDate');

    const bill = await this.prisma.$transaction(async (tx) => {
      await this.assertSupplier(tx, dto.supplierId, companyId);
      if (dto.branchId) await this.assertBranch(tx, dto.branchId, companyId);
      if (dto.purchaseOrderId) {
        const po = await tx.purchaseOrder.findFirst({
          where: { id: dto.purchaseOrderId, companyId, deletedAt: null },
        });
        if (!po) {
          throw new NotFoundException({
            code: 'PURCHASE_ORDER_NOT_FOUND',
            message: `Purchase order ${dto.purchaseOrderId} was not found.`,
            field: 'purchaseOrderId',
          });
        }
      }
      await this.assertNotOverBilled(
        tx,
        companyId,
        dto.purchaseOrderId ?? null,
        dto.lines.map((l) => ({
          purchaseOrderLineId: l.purchaseOrderLineId ?? null,
          qty: l.qty,
        })),
      );
      const rate = await resolveRate(
        tx,
        companyId,
        dto.currencyCode,
        dto.rate,
        billDate,
      );
      const lines = await this.buildLines(tx, companyId, dto.lines);
      const totals = computeTotals(
        lines.map((l) => ({
          netAmount: l.netAmount,
          vatAmount: l.vatAmount,
          totalAmount: l.totalAmount,
        })),
        rate,
      );
      const billNo = await this.sequences.nextNumber(
        companyId,
        dto.branchId ?? null,
        DocumentType.PURCHASE_INVOICE,
        billDate,
        tx,
      );

      return tx.vendorBill.create({
        data: {
          companyId,
          billNo,
          supplierId: dto.supplierId,
          purchaseOrderId: dto.purchaseOrderId ?? null,
          branchId: dto.branchId ?? null,
          currencyCode: dto.currencyCode,
          rate: toDecimal(rate),
          billDate,
          dueDate: dto.dueDate ? this.parseDate(dto.dueDate, 'dueDate') : null,
          supplierRef: dto.supplierRef ?? null,
          notes: dto.notes ?? null,
          subtotal: toDecimal(totals.subtotal),
          vatTotal: toDecimal(totals.vatTotal),
          grandTotal: toDecimal(totals.grandTotal),
          subtotalBase: toDecimal(totals.subtotalBase),
          vatTotalBase: toDecimal(totals.vatTotalBase),
          grandTotalBase: toDecimal(totals.grandTotalBase),
          createdBy: caller.userId,
          lines: {
            create: lines.map((l, i) => ({
              companyId,
              lineNo: i + 1,
              itemId: l.itemId,
              variantId: l.variantId,
              uomId: l.uomId,
              purchaseOrderLineId: l.purchaseOrderLineId,
              qty: toDecimal(l.qty),
              unitCost: toDecimal(l.unitCost),
              taxRateId: l.taxRateId,
              vatTreatment: l.vatTreatment,
              ratePct: toDecimal(l.ratePct),
              netAmount: toDecimal(l.netAmount),
              vatAmount: toDecimal(l.vatAmount),
              totalAmount: toDecimal(l.totalAmount),
              description: l.description,
            })),
          },
        },
        include: VB_INCLUDE,
      });
    });
    return toVendorBillResponse(bill);
  }

  /**
   * Confirm a DRAFT bill: post the GL entry (DR inventory + DR input VAT + CR
   * supplier payable, in base currency) and flip it to POSTED. The entry is
   * created POSTED directly (mirroring PostingService.reverse) so bill + ledger
   * commit atomically; the DB balance trigger validates it. Resolves the
   * deferred sourceDoc link (docs/DEFERRED.md #6).
   */
  async confirm(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<VendorBillResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (existing.status !== VendorBillStatus.DRAFT) {
      throw new ConflictException({
        code: 'BILL_NOT_DRAFT',
        message: `Only a DRAFT vendor bill can be posted (this one is ${existing.status}).`,
        field: null,
      });
    }

    const bill = await this.prisma.$transaction(async (tx) => {
      const companyId = existing.companyId;
      // Re-check at post time (authoritative): another bill may have posted
      // against these PO lines since this draft was created.
      await this.assertNotOverBilled(
        tx,
        companyId,
        existing.purchaseOrderId,
        existing.lines.map((l) => ({
          purchaseOrderLineId: l.purchaseOrderLineId,
          qty: Number(l.qty),
        })),
      );
      const baseCurrency = (
        await tx.company.findUniqueOrThrow({
          where: { id: companyId },
          select: { baseCurrencyCode: true },
        })
      ).baseCurrencyCode;
      const rate = Number(existing.rate);

      const inventoryAcc = await this.controlAccount(
        tx,
        companyId,
        ControlType.INVENTORY,
        'INVENTORY_ACCOUNT_MISSING',
      );
      const supplier = await tx.partner.findUniqueOrThrow({
        where: { id: existing.supplierId },
        select: { payableAccountId: true },
      });
      const payableAccId =
        supplier.payableAccountId ??
        (
          await this.controlAccount(
            tx,
            companyId,
            ControlType.AP,
            'PAYABLE_ACCOUNT_MISSING',
          )
        ).id;

      // Aggregate the base-currency posting amounts from the frozen line values.
      let inventoryBase = 0;
      const vatByAccount = new Map<string, number>();
      for (const l of existing.lines) {
        inventoryBase = round2(inventoryBase + Number(l.netAmount) / rate);
        const vat = Number(l.vatAmount);
        if (vat > 0) {
          const vatAcc =
            l.taxRateId != null
              ? ((
                  await tx.taxRate.findUnique({
                    where: { id: l.taxRateId },
                    select: { vatInAccountId: true },
                  })
                )?.vatInAccountId ?? null)
              : null;
          const accId =
            vatAcc ??
            (
              await this.controlAccount(
                tx,
                companyId,
                ControlType.VAT_IN,
                'VAT_IN_ACCOUNT_MISSING',
              )
            ).id;
          vatByAccount.set(
            accId,
            round2((vatByAccount.get(accId) ?? 0) + vat / rate),
          );
        }
      }

      const lines: Prisma.JournalLineCreateManyJournalEntryInput[] = [];
      let lineNo = 1;
      const pushLine = (
        accountId: string,
        side: JournalSide,
        amountBase: number,
        partnerId: string | null,
      ): void => {
        lines.push({
          companyId,
          lineNo: lineNo++,
          accountId,
          side,
          amountOriginal: toDecimal(amountBase),
          currency: baseCurrency,
          rate: toDecimal(1),
          amountBase: toDecimal(amountBase),
          partnerId,
        });
      };
      pushLine(inventoryAcc.id, JournalSide.DEBIT, inventoryBase, null);
      let payableBase = inventoryBase;
      for (const [accId, amt] of vatByAccount) {
        pushLine(accId, JournalSide.DEBIT, amt, null);
        payableBase = round2(payableBase + amt);
      }
      pushLine(
        payableAccId,
        JournalSide.CREDIT,
        payableBase,
        existing.supplierId,
      );

      const entryNumber = await this.sequences.nextNumber(
        companyId,
        existing.branchId,
        DocumentType.JOURNAL_ENTRY,
        existing.billDate,
        tx,
      );
      const entry = await tx.journalEntry.create({
        data: {
          companyId,
          branchId: existing.branchId,
          entryNumber,
          date: existing.billDate,
          reference: existing.billNo,
          description: `Vendor bill ${existing.billNo}`,
          status: JournalStatus.POSTED,
          sourceDocType: DocumentType.PURCHASE_INVOICE,
          sourceDocId: existing.id,
          postedAt: new Date(),
          postedById: caller.userId,
          createdById: caller.userId,
          lines: { createMany: { data: lines } },
        },
      });

      await this.audit.record(
        {
          action: AuditAction.POST,
          entity: 'VendorBill',
          entityId: existing.id,
          companyId,
          userId: caller.userId,
          after: { billNo: existing.billNo, journalEntryId: entry.id },
        },
        tx,
      );

      if (existing.purchaseOrderId) {
        await tx.purchaseOrder.updateMany({
          where: {
            id: existing.purchaseOrderId,
            status: PurchaseOrderStatus.RECEIVED,
          },
          data: { status: PurchaseOrderStatus.BILLED },
        });
      }

      return tx.vendorBill.update({
        where: { id: existing.id },
        data: {
          status: VendorBillStatus.POSTED,
          journalEntryId: entry.id,
          postedAt: new Date(),
        },
        include: VB_INCLUDE,
      });
    });
    return toVendorBillResponse(bill);
  }

  async findAll(
    query: QueryVendorBillDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<VendorBillResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.VendorBillWhereInput = { deletedAt: null };
    if (query.companyId) where.companyId = query.companyId;
    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;
    const client = this.clientFor(caller);
    const [rows, total] = await this.prisma.$transaction([
      client.vendorBill.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: VB_INCLUDE,
      }),
      client.vendorBill.count({ where }),
    ]);
    return Paginated.of(rows.map(toVendorBillResponse), total, page, limit);
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<VendorBillResponseDto> {
    return toVendorBillResponse(await this.getOwned(id, caller));
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    const existing = await this.getOwned(id, caller);
    if (existing.status === VendorBillStatus.POSTED) {
      throw new ConflictException({
        code: 'BILL_POSTED',
        message: 'A posted bill cannot be deleted; reverse its journal entry.',
        field: null,
      });
    }
    await this.clientFor(caller).vendorBill.update({
      where: { id },
      data: { deletedAt: new Date(), status: VendorBillStatus.CANCELLED },
    });
  }

  // --- helpers -------------------------------------------------------------

  private async getOwned(id: string, caller: AuthenticatedUser) {
    const bill = await this.clientFor(caller).vendorBill.findFirst({
      where: { id, deletedAt: null },
      include: VB_INCLUDE,
    });
    if (!bill) {
      throw new NotFoundException({
        code: 'VENDOR_BILL_NOT_FOUND',
        message: `Vendor bill ${id} was not found.`,
        field: null,
      });
    }
    return bill;
  }

  private async controlAccount(
    tx: Prisma.TransactionClient,
    companyId: string,
    controlType: ControlType,
    missingCode: string,
  ) {
    const account = await tx.account.findFirst({
      where: { companyId, controlType, deletedAt: null },
    });
    if (!account) {
      throw new BadRequestException({
        code: missingCode,
        message: `No ${controlType} control account is configured for this company.`,
        field: null,
      });
    }
    return account;
  }

  /**
   * Quantity floor: the cumulative billed qty per PO line must not exceed the
   * ordered qty. Legitimate splits (which sum to the ordered qty) pass; a
   * duplicate full bill — or any bill pushing a line past its order — is
   * rejected (PO_LINE_OVER_BILLED). Only counts POSTED bills, so this draft
   * isn't double-counted. Lines with no purchaseOrderLineId (ad-hoc charges,
   * non-PO bills) are exempt. Also validates the PO-line linkage.
   * NOTE: the received-qty ceiling, price-variance tolerance and permissioned
   * override are the fuller three-way match (deferred, docs/DEFERRED.md).
   */
  private async assertNotOverBilled(
    tx: Prisma.TransactionClient,
    companyId: string,
    billPurchaseOrderId: string | null,
    lines: { purchaseOrderLineId: string | null; qty: number }[],
  ): Promise<void> {
    const byPoLine = new Map<string, number>();
    for (const l of lines) {
      if (!l.purchaseOrderLineId) continue;
      byPoLine.set(
        l.purchaseOrderLineId,
        (byPoLine.get(l.purchaseOrderLineId) ?? 0) + l.qty,
      );
    }
    for (const [poLineId, thisQty] of byPoLine) {
      const poLine = await tx.purchaseOrderLine.findFirst({
        where: { id: poLineId, companyId },
        select: { id: true, qtyOrdered: true, purchaseOrderId: true },
      });
      if (
        !poLine ||
        (billPurchaseOrderId && poLine.purchaseOrderId !== billPurchaseOrderId)
      ) {
        throw new BadRequestException({
          code: 'PO_LINE_MISMATCH',
          message: `Purchase-order line ${poLineId} does not belong to this bill's purchase order.`,
          field: 'purchaseOrderLineId',
        });
      }
      const posted = await tx.vendorBillLine.aggregate({
        _sum: { qty: true },
        where: {
          purchaseOrderLineId: poLineId,
          vendorBill: { status: VendorBillStatus.POSTED, deletedAt: null },
        },
      });
      const alreadyBilled = Number(posted._sum.qty ?? 0);
      const ordered = Number(poLine.qtyOrdered);
      if (alreadyBilled + thisQty > ordered + 1e-9) {
        throw new ConflictException({
          code: 'PO_LINE_OVER_BILLED',
          message: `PO line ${poLineId}: ordered ${ordered}, already billed ${alreadyBilled}; this bill's ${thisQty} would exceed the order.`,
          field: 'qty',
        });
      }
    }
  }

  private async buildLines(
    tx: Prisma.TransactionClient,
    companyId: string,
    lines: CreateVendorBillDto['lines'],
  ): Promise<BuiltBillLine[]> {
    const built: BuiltBillLine[] = [];
    for (const line of lines) {
      const item = await tx.item.findFirst({
        where: { id: line.itemId, companyId, deletedAt: null },
      });
      if (!item) {
        throw new NotFoundException({
          code: 'ITEM_NOT_FOUND',
          message: `Item ${line.itemId} was not found in this company.`,
          field: 'itemId',
        });
      }
      if ((item.hasSize || item.hasColour) && !line.variantId) {
        throw new BadRequestException({
          code: 'VARIANT_REQUIRED',
          message: `Item ${item.code} has variants; a variantId is required.`,
          field: 'variantId',
        });
      }
      const uomId = line.uomId ?? item.purchaseUomId ?? item.baseUomId;
      const uom = await tx.uom.findFirst({ where: { id: uomId, companyId } });
      if (!uom) {
        throw new NotFoundException({
          code: 'UOM_NOT_FOUND',
          message: `UoM ${uomId} was not found in this company.`,
          field: 'uomId',
        });
      }
      const vatTreatment = item.vatTreatment;
      const taxRateId = line.taxRateId ?? item.defaultTaxRateId ?? null;
      let ratePct = 0;
      let vatInAccountId: string | null = null;
      if (vatTreatment === TaxTreatment.STANDARD && taxRateId) {
        const taxRate = await tx.taxRate.findFirst({
          where: { id: taxRateId, companyId },
        });
        if (!taxRate) {
          throw new NotFoundException({
            code: 'TAX_RATE_NOT_FOUND',
            message: `Tax rate ${taxRateId} was not found in this company.`,
            field: 'taxRateId',
          });
        }
        ratePct = Number(taxRate.ratePct);
        vatInAccountId = taxRate.vatInAccountId;
      }
      const amounts = computeLine({
        qty: line.qty,
        unitCost: line.unitCost,
        vatTreatment,
        ratePct,
      });
      built.push({
        itemId: item.id,
        variantId: line.variantId ?? null,
        uomId,
        purchaseOrderLineId: line.purchaseOrderLineId ?? null,
        qty: line.qty,
        unitCost: line.unitCost,
        taxRateId: vatTreatment === TaxTreatment.STANDARD ? taxRateId : null,
        vatInAccountId,
        vatTreatment,
        ratePct,
        ...amounts,
        description: line.description ?? null,
      });
    }
    return built;
  }

  private async assertSupplier(
    tx: Prisma.TransactionClient,
    supplierId: string,
    companyId: string,
  ): Promise<void> {
    const supplier = await tx.partner.findFirst({
      where: { id: supplierId, companyId, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundException({
        code: 'PARTNER_NOT_FOUND',
        message: `Supplier ${supplierId} was not found in this company.`,
        field: 'supplierId',
      });
    }
    if (!supplier.isSupplier) {
      throw new BadRequestException({
        code: 'PARTNER_NOT_SUPPLIER',
        message: `Partner "${supplier.name}" is not marked as a supplier.`,
        field: 'supplierId',
      });
    }
  }

  private async assertBranch(
    tx: Prisma.TransactionClient,
    branchId: string,
    companyId: string,
  ): Promise<void> {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, companyId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException({
        code: 'BRANCH_NOT_FOUND',
        message: `Branch ${branchId} was not found in this company.`,
        field: 'branchId',
      });
    }
  }

  private parseDate(value: string, field: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `"${value}" is not a valid date.`,
        field,
      });
    }
    return d;
  }
}
