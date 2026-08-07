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
  LocationType,
  Prisma,
  SalesInvoiceStatus,
  StockMovementType,
  TaxTreatment,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import { SequencesService } from '../sequences/sequences.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../stock/stock.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CreateSalesInvoiceDto,
  QuerySalesInvoiceDto,
  SalesInvoiceResponseDto,
} from './dto/sales-invoice.dto';
import { computeLine, computeTotals, toDecimal } from './invoicing.money';
import { resolveRate } from './invoicing.rate';
import { toSalesInvoiceResponse, SI_INCLUDE } from './invoicing.mappers';

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

interface BuiltLine {
  itemId: string;
  variantId: string | null;
  uomId: string;
  qty: number;
  unitPrice: number;
  lineDiscountPct: number;
  taxRateId: string | null;
  vatTreatment: TaxTreatment;
  ratePct: number;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  trackInventory: boolean;
  description: string | null;
}

@Injectable()
export class SalesInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequencesService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
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
    dto: CreateSalesInvoiceDto,
    caller: AuthenticatedUser,
  ): Promise<SalesInvoiceResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const invoiceDate = this.parseDate(dto.invoiceDate, 'invoiceDate');

    const invoice = await this.prisma.$transaction(async (tx) => {
      await this.assertCustomer(tx, dto.customerId, companyId);
      if (dto.branchId) await this.assertBranch(tx, dto.branchId, companyId);
      if (dto.locationId)
        await this.assertInternalLocation(tx, dto.locationId, companyId);

      const rate = await resolveRate(
        tx,
        companyId,
        dto.currencyCode,
        dto.rate,
        invoiceDate,
      );
      const lines = await this.buildLines(tx, companyId, dto.lines);

      // A stock-tracked line can only post if the invoice knows where to ship
      // from — require the internal source location up front.
      if (lines.some((l) => l.trackInventory) && !dto.locationId) {
        throw new BadRequestException({
          code: 'LOCATION_REQUIRED',
          message:
            'This invoice sells stock-tracked items; a source locationId is required.',
          field: 'locationId',
        });
      }

      const totals = computeTotals(
        lines.map((l) => ({
          netAmount: l.netAmount,
          vatAmount: l.vatAmount,
          totalAmount: l.totalAmount,
        })),
        rate,
      );
      const invoiceNo = await this.sequences.nextNumber(
        companyId,
        dto.branchId ?? null,
        DocumentType.SALES_INVOICE,
        invoiceDate,
        tx,
      );
      const baseCurrencyCode = await this.baseCurrencyOf(tx, companyId);

      return tx.salesInvoice.create({
        data: {
          companyId,
          invoiceNo,
          customerId: dto.customerId,
          branchId: dto.branchId ?? null,
          locationId: dto.locationId ?? null,
          currencyCode: dto.currencyCode,
          baseCurrencyCode,
          rate: toDecimal(rate),
          invoiceDate,
          dueDate: dto.dueDate ? this.parseDate(dto.dueDate, 'dueDate') : null,
          customerRef: dto.customerRef ?? null,
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
              qty: toDecimal(l.qty),
              unitPrice: toDecimal(l.unitPrice),
              lineDiscountPct: toDecimal(l.lineDiscountPct),
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
        include: SI_INCLUDE,
      });
    });
    return toSalesInvoiceResponse(invoice);
  }

  /**
   * Confirm a DRAFT invoice: relieve stock (ISSUE at moving-average cost) for
   * stock-tracked lines, then post the GL entry — DR AR, CR revenue, CR output
   * VAT, and DR COGS / CR inventory — all in base currency, atomically. The
   * entry is created POSTED directly (mirroring VendorBillsService) so invoice +
   * stock + ledger commit together; the DB balance trigger validates it.
   */
  async confirm(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<SalesInvoiceResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (existing.status !== SalesInvoiceStatus.DRAFT) {
      throw new ConflictException({
        code: 'INVOICE_NOT_DRAFT',
        message: `Only a DRAFT sales invoice can be posted (this one is ${existing.status}).`,
        field: null,
      });
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      const companyId = existing.companyId;
      const baseCurrency = await this.baseCurrencyOf(tx, companyId);
      const rate = Number(existing.rate);

      const customer = await tx.partner.findUniqueOrThrow({
        where: { id: existing.customerId },
        select: { receivableAccountId: true },
      });
      const arAccId =
        customer.receivableAccountId ??
        (
          await this.controlAccount(
            tx,
            companyId,
            ControlType.AR,
            'RECEIVABLE_ACCOUNT_MISSING',
          )
        ).id;

      // --- 1. Relieve stock for stock-tracked lines (COGS at moving average) ---
      let customerLocId: string | null = null;
      const cogsByAccount = new Map<string, number>();
      let cogsTotal = 0;
      for (const l of existing.lines) {
        const item = await tx.item.findUniqueOrThrow({
          where: { id: l.itemId },
          select: {
            trackInventory: true,
            cogsAccountId: true,
            category: { select: { cogsAccountId: true } },
          },
        });
        if (!item.trackInventory) continue;
        if (!existing.locationId) {
          throw new BadRequestException({
            code: 'LOCATION_REQUIRED',
            message:
              'This invoice sells stock-tracked items; a source locationId is required.',
            field: 'locationId',
          });
        }
        if (!customerLocId) {
          customerLocId = (
            await this.virtualLocation(tx, companyId, LocationType.CUSTOMER)
          ).id;
        }
        const movement = await this.stock.postMovementInTx(
          tx,
          {
            type: StockMovementType.ISSUE,
            movementDate: existing.invoiceDate.toISOString().slice(0, 10),
            itemId: l.itemId,
            variantId: l.variantId ?? undefined,
            fromLocationId: existing.locationId,
            toLocationId: customerLocId,
            qty: Number(l.qty),
            uomId: l.uomId,
            partnerId: existing.customerId,
            branchId: existing.branchId ?? undefined,
            reference: existing.invoiceNo,
            sourceDocType: DocumentType.SALES_INVOICE,
            sourceDocId: existing.id,
            companyId,
          },
          caller,
        );
        const cogsBase = Number(movement.value);
        const cogsAccId =
          item.cogsAccountId ??
          item.category?.cogsAccountId ??
          (
            await this.controlAccount(
              tx,
              companyId,
              ControlType.COGS,
              'COGS_ACCOUNT_MISSING',
            )
          ).id;
        cogsByAccount.set(
          cogsAccId,
          round2((cogsByAccount.get(cogsAccId) ?? 0) + cogsBase),
        );
        cogsTotal = round2(cogsTotal + cogsBase);
        await tx.salesInvoiceLine.update({
          where: { id: l.id },
          data: {
            costBase: new Prisma.Decimal(Number(movement.unitCost)),
            stockMovementId: movement.id,
          },
        });
      }

      // --- 2. Revenue + output VAT + AR, from the frozen line amounts ---------
      const revByAccount = new Map<string, number>();
      const vatByAccount = new Map<string, number>();
      let arBase = 0;
      for (const l of existing.lines) {
        const item = await tx.item.findUniqueOrThrow({
          where: { id: l.itemId },
          select: {
            revenueAccountId: true,
            category: { select: { revenueAccountId: true } },
          },
        });
        const netBase = round2(Number(l.netAmount) / rate);
        const revAccId =
          item.revenueAccountId ??
          item.category?.revenueAccountId ??
          (
            await this.controlAccount(
              tx,
              companyId,
              ControlType.REVENUE,
              'REVENUE_ACCOUNT_MISSING',
            )
          ).id;
        revByAccount.set(
          revAccId,
          round2((revByAccount.get(revAccId) ?? 0) + netBase),
        );
        arBase = round2(arBase + netBase);

        const vat = Number(l.vatAmount);
        if (vat > 0) {
          const vatBase = round2(vat / rate);
          const vatAcc =
            l.taxRateId != null
              ? ((
                  await tx.taxRate.findUnique({
                    where: { id: l.taxRateId },
                    select: { vatOutAccountId: true },
                  })
                )?.vatOutAccountId ?? null)
              : null;
          const vatAccId =
            vatAcc ??
            (
              await this.controlAccount(
                tx,
                companyId,
                ControlType.VAT_OUT,
                'VAT_OUT_ACCOUNT_MISSING',
              )
            ).id;
          vatByAccount.set(
            vatAccId,
            round2((vatByAccount.get(vatAccId) ?? 0) + vatBase),
          );
          arBase = round2(arBase + vatBase);
        }
      }

      // --- 3. Assemble the balanced journal entry ----------------------------
      const jLines: Prisma.JournalLineCreateManyJournalEntryInput[] = [];
      let lineNo = 1;
      const push = (
        accountId: string,
        side: JournalSide,
        amountBase: number,
        partnerId: string | null,
      ): void => {
        jLines.push({
          companyId,
          lineNo: lineNo++,
          accountId,
          side,
          amountOriginal: toDecimal(amountBase),
          currency: baseCurrency,
          rate: toDecimal(1),
          amountBase: toDecimal(amountBase),
          baseCurrencyCode: baseCurrency,
          partnerId,
        });
      };
      push(arAccId, JournalSide.DEBIT, arBase, existing.customerId);
      for (const [acc, amt] of revByAccount)
        push(acc, JournalSide.CREDIT, amt, null);
      for (const [acc, amt] of vatByAccount)
        push(acc, JournalSide.CREDIT, amt, null);
      if (cogsTotal > 0) {
        const inventoryAcc = await this.controlAccount(
          tx,
          companyId,
          ControlType.INVENTORY,
          'INVENTORY_ACCOUNT_MISSING',
        );
        for (const [acc, amt] of cogsByAccount)
          push(acc, JournalSide.DEBIT, amt, null);
        push(inventoryAcc.id, JournalSide.CREDIT, cogsTotal, null);
      }

      const entryNumber = await this.sequences.nextNumber(
        companyId,
        existing.branchId,
        DocumentType.JOURNAL_ENTRY,
        existing.invoiceDate,
        tx,
      );
      const entry = await tx.journalEntry.create({
        data: {
          companyId,
          branchId: existing.branchId,
          entryNumber,
          date: existing.invoiceDate,
          reference: existing.invoiceNo,
          description: `Sales invoice ${existing.invoiceNo}`,
          status: JournalStatus.POSTED,
          sourceDocType: DocumentType.SALES_INVOICE,
          sourceDocId: existing.id,
          postedAt: new Date(),
          postedById: caller.userId,
          createdById: caller.userId,
          lines: { createMany: { data: jLines } },
        },
      });

      await this.audit.record(
        {
          action: AuditAction.POST,
          entity: 'SalesInvoice',
          entityId: existing.id,
          companyId,
          userId: caller.userId,
          after: { invoiceNo: existing.invoiceNo, journalEntryId: entry.id },
        },
        tx,
      );

      return tx.salesInvoice.update({
        where: { id: existing.id },
        data: {
          status: SalesInvoiceStatus.POSTED,
          journalEntryId: entry.id,
          postedAt: new Date(),
          cogsTotalBase: toDecimal(cogsTotal),
        },
        include: SI_INCLUDE,
      });
    });
    return toSalesInvoiceResponse(invoice);
  }

  async findAll(
    query: QuerySalesInvoiceDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<SalesInvoiceResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SalesInvoiceWhereInput = { deletedAt: null };
    if (query.companyId) where.companyId = query.companyId;
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;
    const client = this.clientFor(caller);
    const [rows, total] = await this.prisma.$transaction([
      client.salesInvoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: SI_INCLUDE,
      }),
      client.salesInvoice.count({ where }),
    ]);
    return Paginated.of(rows.map(toSalesInvoiceResponse), total, page, limit);
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<SalesInvoiceResponseDto> {
    return toSalesInvoiceResponse(await this.getOwned(id, caller));
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    const existing = await this.getOwned(id, caller);
    if (existing.status === SalesInvoiceStatus.POSTED) {
      throw new ConflictException({
        code: 'INVOICE_POSTED',
        message:
          'A posted invoice cannot be deleted; issue a credit note instead.',
        field: null,
      });
    }
    await this.clientFor(caller).salesInvoice.update({
      where: { id },
      data: { deletedAt: new Date(), status: SalesInvoiceStatus.CANCELLED },
    });
  }

  // --- helpers -------------------------------------------------------------

  private async getOwned(id: string, caller: AuthenticatedUser) {
    const invoice = await this.clientFor(caller).salesInvoice.findFirst({
      where: { id, deletedAt: null },
      include: SI_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException({
        code: 'SALES_INVOICE_NOT_FOUND',
        message: `Sales invoice ${id} was not found.`,
        field: null,
      });
    }
    return invoice;
  }

  private async baseCurrencyOf(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<string> {
    const company = await tx.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { baseCurrencyCode: true },
    });
    return company.baseCurrencyCode;
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

  private async virtualLocation(
    tx: Prisma.TransactionClient,
    companyId: string,
    type: LocationType,
  ) {
    const loc = await tx.location.findFirst({
      where: { companyId, type, deletedAt: null },
    });
    if (!loc) {
      throw new NotFoundException({
        code: 'VIRTUAL_LOCATION_MISSING',
        message: `No ${type} location is configured for this company.`,
        field: null,
      });
    }
    return loc;
  }

  private async buildLines(
    tx: Prisma.TransactionClient,
    companyId: string,
    lines: CreateSalesInvoiceDto['lines'],
  ): Promise<BuiltLine[]> {
    const built: BuiltLine[] = [];
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
      const uomId = line.uomId ?? item.salesUomId ?? item.baseUomId;
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
      }
      const unitPrice = line.unitPrice ?? Number(item.salePrice);
      const lineDiscountPct = line.lineDiscountPct ?? 0;
      const amounts = computeLine({
        qty: line.qty,
        unitPrice,
        lineDiscountPct,
        vatTreatment,
        ratePct,
      });
      built.push({
        itemId: item.id,
        variantId: line.variantId ?? null,
        uomId,
        qty: line.qty,
        unitPrice,
        lineDiscountPct,
        taxRateId: vatTreatment === TaxTreatment.STANDARD ? taxRateId : null,
        vatTreatment,
        ratePct,
        trackInventory: item.trackInventory,
        ...amounts,
        description: line.description ?? null,
      });
    }
    return built;
  }

  private async assertCustomer(
    tx: Prisma.TransactionClient,
    customerId: string,
    companyId: string,
  ): Promise<void> {
    const customer = await tx.partner.findFirst({
      where: { id: customerId, companyId, deletedAt: null },
    });
    if (!customer) {
      throw new NotFoundException({
        code: 'PARTNER_NOT_FOUND',
        message: `Customer ${customerId} was not found in this company.`,
        field: 'customerId',
      });
    }
    if (!customer.isCustomer) {
      throw new BadRequestException({
        code: 'PARTNER_NOT_CUSTOMER',
        message: `Partner "${customer.name}" is not marked as a customer.`,
        field: 'customerId',
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

  private async assertInternalLocation(
    tx: Prisma.TransactionClient,
    locationId: string,
    companyId: string,
  ): Promise<void> {
    const loc = await tx.location.findFirst({
      where: { id: locationId, companyId, deletedAt: null },
    });
    if (!loc || loc.type !== LocationType.INTERNAL) {
      throw new BadRequestException({
        code: 'LOCATION_INVALID',
        message: 'The source must be an internal location in this company.',
        field: 'locationId',
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
