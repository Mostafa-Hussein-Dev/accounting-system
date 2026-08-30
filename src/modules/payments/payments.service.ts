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
  PaymentDirection,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import { SequencesService } from '../sequences/sequences.service';
import { AuditService } from '../audit/audit.service';
import { PostingService } from '../gl/posting.service';
import { FiscalPeriodsService } from '../fiscal-periods/fiscal-periods.service';
import { isPlatformAdmin } from '../auth/interfaces/authenticated-user.interface';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreatePaymentDto,
  OpenItemResponseDto,
  OpenItemsQueryDto,
  PaymentResponseDto,
  QueryPaymentDto,
} from './dto/payment.dto';
import { PAYMENT_INCLUDE, toPaymentResponse } from './payments.mappers';
import { resolveRate } from './payments.rate';

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;
const toDecimal = (n: number): Prisma.Decimal => new Prisma.Decimal(n);
// Tolerance for cent-level rounding when comparing money amounts.
const EPS = 0.005;

interface JournalLineDraft {
  accountId: string;
  side: JournalSide;
  amountBase: number;
  partnerId: string | null;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequencesService,
    private readonly audit: AuditService,
    private readonly posting: PostingService,
    private readonly fiscalPeriods: FiscalPeriodsService,
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

  private parseDate(value: string, field: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: `${field} is not a valid date.`,
        field,
      });
    }
    return d;
  }

  async create(
    dto: CreatePaymentDto,
    caller: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    const paymentDate = this.parseDate(dto.paymentDate, 'paymentDate');
    const amount = round2(dto.amount);
    const isReceipt = dto.direction === PaymentDirection.IN;

    const payment = await this.prisma.$transaction(async (tx) => {
      // FR-904: block posting a payment into a locked fiscal period.
      await this.fiscalPeriods.assertOpen(companyId, paymentDate, tx);
      const baseCurrency = await this.baseCurrencyOf(tx, companyId);

      // --- 1. Validate the partner + its role for this direction ------------
      const partner = await tx.partner.findFirst({
        where: { id: dto.partnerId, companyId, deletedAt: null },
        select: {
          id: true,
          isCustomer: true,
          isSupplier: true,
          receivableAccountId: true,
          payableAccountId: true,
        },
      });
      if (!partner) {
        throw new NotFoundException({
          code: 'PARTNER_NOT_FOUND',
          message: `Partner ${dto.partnerId} was not found.`,
          field: 'partnerId',
        });
      }
      if (isReceipt && !partner.isCustomer) {
        throw new BadRequestException({
          code: 'PARTNER_NOT_CUSTOMER',
          message: 'A receipt can only be recorded against a customer.',
          field: 'partnerId',
        });
      }
      if (!isReceipt && !partner.isSupplier) {
        throw new BadRequestException({
          code: 'PARTNER_NOT_SUPPLIER',
          message: 'A payment can only be recorded against a supplier.',
          field: 'partnerId',
        });
      }

      // --- 2. Validate the cash/bank account --------------------------------
      const cashAcc = await tx.account.findFirst({
        where: { id: dto.cashAccountId, companyId, deletedAt: null },
        select: { id: true, controlType: true, isActive: true, number: true },
      });
      if (!cashAcc) {
        throw new NotFoundException({
          code: 'CASH_ACCOUNT_NOT_FOUND',
          message: `Account ${dto.cashAccountId} was not found.`,
          field: 'cashAccountId',
        });
      }
      if (!cashAcc.isActive) {
        throw new BadRequestException({
          code: 'ACCOUNT_INACTIVE',
          message: `Account ${cashAcc.number} is inactive.`,
          field: 'cashAccountId',
        });
      }
      if (
        cashAcc.controlType !== ControlType.CASH &&
        cashAcc.controlType !== ControlType.BANK
      ) {
        throw new BadRequestException({
          code: 'CASH_ACCOUNT_INVALID',
          message: `Account ${cashAcc.number} is not a cash or bank account.`,
          field: 'cashAccountId',
        });
      }

      if (dto.branchId) await this.assertBranch(tx, dto.branchId, companyId);

      const rate = await resolveRate(
        tx,
        companyId,
        dto.currencyCode,
        dto.rate,
        paymentDate,
      );
      const amountBase = round2(amount / rate);

      // The party control account (customer AR, or supplier AP), overridable
      // per-partner (same resolution as invoicing/purchasing).
      const partyAccId = isReceipt
        ? (partner.receivableAccountId ??
          (await this.controlAccount(tx, companyId, ControlType.AR)).id)
        : (partner.payableAccountId ??
          (await this.controlAccount(tx, companyId, ControlType.AP)).id);
      const allocDocType = isReceipt
        ? DocumentType.SALES_INVOICE
        : DocumentType.PURCHASE_INVOICE;

      // --- 3. Validate + value each allocation ------------------------------
      const allocations = dto.allocations ?? [];
      let allocOriginalSum = 0;
      let partyClearedBase = 0; // AR/AP relieved at each document's booked rate
      const allocRows: Prisma.PaymentAllocationCreateManyPaymentInput[] = [];
      for (const a of allocations) {
        const doc = await this.loadOpenDocument(
          tx,
          companyId,
          dto.direction,
          a.documentId,
        );
        if (doc.partnerId !== dto.partnerId) {
          throw new BadRequestException({
            code: 'DOCUMENT_PARTNER_MISMATCH',
            message: `Document ${doc.number} does not belong to this partner.`,
            field: 'allocations',
          });
        }
        if (doc.currencyCode !== dto.currencyCode) {
          throw new BadRequestException({
            code: 'ALLOCATION_CURRENCY_MISMATCH',
            message: `Document ${doc.number} is in ${doc.currencyCode}; the payment is in ${dto.currencyCode}. Settle a document in its own currency.`,
            field: 'allocations',
          });
        }
        const openOriginal = await this.openBalanceOriginal(
          tx,
          companyId,
          allocDocType,
          doc.id,
          Number(doc.grandTotal),
        );
        const allocAmt = round2(a.amount);
        if (allocAmt > openOriginal + EPS) {
          throw new BadRequestException({
            code: 'ALLOCATION_EXCEEDS_BALANCE',
            message: `Cannot apply ${allocAmt} to ${doc.number}; its open balance is ${openOriginal}.`,
            field: 'allocations',
          });
        }
        const clearedBase = round2(allocAmt / Number(doc.rate));
        partyClearedBase = round2(partyClearedBase + clearedBase);
        allocOriginalSum = round2(allocOriginalSum + allocAmt);
        allocRows.push({
          companyId,
          documentType: allocDocType,
          documentId: doc.id,
          amountOriginal: toDecimal(allocAmt),
          amountBase: toDecimal(clearedBase),
        });
      }

      if (allocOriginalSum > amount + EPS) {
        throw new BadRequestException({
          code: 'ALLOCATIONS_EXCEED_PAYMENT',
          message: `Allocations (${allocOriginalSum}) exceed the payment amount (${amount}).`,
          field: 'allocations',
        });
      }

      // Whatever is not allocated sits on the partner's account, booked at the
      // payment rate (no FX until it is later applied to a document).
      const onAccountOriginal = round2(amount - allocOriginalSum);
      const onAccountBase = round2(onAccountOriginal / rate);
      const partyTotalBase = round2(partyClearedBase + onAccountBase);

      // --- 4. Assemble the balanced journal entry ---------------------------
      const draft: JournalLineDraft[] = [];
      if (isReceipt) {
        draft.push({
          accountId: cashAcc.id,
          side: JournalSide.DEBIT,
          amountBase,
          partnerId: null,
        });
        draft.push({
          accountId: partyAccId,
          side: JournalSide.CREDIT,
          amountBase: partyTotalBase,
          partnerId: dto.partnerId,
        });
      } else {
        draft.push({
          accountId: cashAcc.id,
          side: JournalSide.CREDIT,
          amountBase,
          partnerId: null,
        });
        draft.push({
          accountId: partyAccId,
          side: JournalSide.DEBIT,
          amountBase: partyTotalBase,
          partnerId: dto.partnerId,
        });
      }

      // Realised FX: whatever is needed to balance the entry is the gain/loss
      // on settling foreign-currency documents at a rate other than booked.
      const totalDebit = round2(
        draft
          .filter((l) => l.side === JournalSide.DEBIT)
          .reduce((s, l) => s + l.amountBase, 0),
      );
      const totalCredit = round2(
        draft
          .filter((l) => l.side === JournalSide.CREDIT)
          .reduce((s, l) => s + l.amountBase, 0),
      );
      const residual = round2(totalDebit - totalCredit);
      if (Math.abs(residual) >= 0.01) {
        if (residual > 0) {
          // More debit than credit → a credit balances it → a gain.
          const fx = await this.controlAccount(
            tx,
            companyId,
            ControlType.FX_GAIN,
          );
          draft.push({
            accountId: fx.id,
            side: JournalSide.CREDIT,
            amountBase: residual,
            partnerId: null,
          });
        } else {
          const fx = await this.controlAccount(
            tx,
            companyId,
            ControlType.FX_LOSS,
          );
          draft.push({
            accountId: fx.id,
            side: JournalSide.DEBIT,
            amountBase: -residual,
            partnerId: null,
          });
        }
      }

      // --- 5. Number, persist the payment, post its journal entry -----------
      const seqType = isReceipt
        ? DocumentType.PAYMENT_RECEIPT
        : DocumentType.SUPPLIER_PAYMENT;
      const paymentNo = await this.sequences.nextNumber(
        companyId,
        dto.branchId ?? null,
        seqType,
        paymentDate,
        tx,
      );

      const created = await tx.payment.create({
        data: {
          companyId,
          paymentNo,
          direction: dto.direction,
          method: dto.method,
          status: PaymentStatus.POSTED,
          partnerId: dto.partnerId,
          cashAccountId: cashAcc.id,
          branchId: dto.branchId ?? null,
          currencyCode: dto.currencyCode,
          baseCurrencyCode: baseCurrency,
          rate: toDecimal(rate),
          amountOriginal: toDecimal(amount),
          amountBase: toDecimal(amountBase),
          reference: dto.reference ?? null,
          paymentDate,
          notes: dto.notes ?? null,
          postedAt: new Date(),
          createdBy: caller.userId,
          allocations: { createMany: { data: allocRows } },
        },
      });

      const entryNumber = await this.sequences.nextNumber(
        companyId,
        dto.branchId ?? null,
        DocumentType.JOURNAL_ENTRY,
        paymentDate,
        tx,
      );
      let lineNo = 1;
      const entry = await tx.journalEntry.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          entryNumber,
          date: paymentDate,
          reference: paymentNo,
          description: `${isReceipt ? 'Receipt' : 'Payment'} ${paymentNo}`,
          status: JournalStatus.POSTED,
          sourceDocType: seqType,
          sourceDocId: created.id,
          postedAt: new Date(),
          postedById: caller.userId,
          createdById: caller.userId,
          lines: {
            createMany: {
              data: draft.map((l) => ({
                companyId,
                lineNo: lineNo++,
                accountId: l.accountId,
                side: l.side,
                amountOriginal: toDecimal(l.amountBase),
                currency: baseCurrency,
                rate: toDecimal(1),
                amountBase: toDecimal(l.amountBase),
                baseCurrencyCode: baseCurrency,
                partnerId: l.partnerId,
              })),
            },
          },
        },
      });

      await tx.payment.update({
        where: { id: created.id },
        data: { journalEntryId: entry.id },
      });

      await this.audit.record(
        {
          action: AuditAction.POST,
          entity: 'Payment',
          entityId: created.id,
          companyId,
          userId: caller.userId,
          after: { paymentNo, journalEntryId: entry.id },
        },
        tx,
      );

      return created;
    });

    return this.findOne(payment.id, caller);
  }

  async findAll(
    query: QueryPaymentDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<PaymentResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PaymentWhereInput = { deletedAt: null };
    if (query.companyId) where.companyId = query.companyId;
    if (query.direction) where.direction = query.direction;
    if (query.status) where.status = query.status;
    if (query.partnerId) where.partnerId = query.partnerId;
    const client = this.clientFor(caller);
    const [rows, total] = await this.prisma.$transaction([
      client.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: PAYMENT_INCLUDE,
      }),
      client.payment.count({ where }),
    ]);
    return Paginated.of(rows.map(toPaymentResponse), total, page, limit);
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    return toPaymentResponse(await this.getOwned(id, caller));
  }

  async void(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (existing.status === PaymentStatus.VOID) {
      throw new ConflictException({
        code: 'PAYMENT_ALREADY_VOID',
        message: `Payment ${existing.paymentNo} is already void.`,
        field: null,
      });
    }
    if (existing.journalEntryId) {
      await this.posting.reverse(
        existing.journalEntryId,
        { reason: `Void of payment ${existing.paymentNo}` },
        caller,
      );
    }
    await this.clientFor(caller).payment.update({
      where: { id: existing.id },
      data: { status: PaymentStatus.VOID, voidedAt: new Date() },
    });
    await this.audit.record({
      action: AuditAction.VOID,
      entity: 'Payment',
      entityId: existing.id,
      companyId: existing.companyId,
      userId: caller.userId,
      before: { status: existing.status },
      after: { status: PaymentStatus.VOID },
    });
    return this.findOne(existing.id, caller);
  }

  async openItems(
    query: OpenItemsQueryDto,
    caller: AuthenticatedUser,
  ): Promise<OpenItemResponseDto[]> {
    const companyId = this.resolveCompanyId(query.companyId, caller);
    const client = this.clientFor(caller);
    const isReceipt = query.direction === PaymentDirection.IN;
    const docType = isReceipt
      ? DocumentType.SALES_INVOICE
      : DocumentType.PURCHASE_INVOICE;

    const docs = isReceipt
      ? (
          await client.salesInvoice.findMany({
            where: {
              companyId,
              customerId: query.partnerId,
              status: 'POSTED',
              deletedAt: null,
            },
            select: {
              id: true,
              invoiceNo: true,
              invoiceDate: true,
              currencyCode: true,
              grandTotal: true,
            },
            orderBy: { invoiceDate: 'asc' },
          })
        ).map((d) => ({
          id: d.id,
          number: d.invoiceNo,
          date: d.invoiceDate,
          currencyCode: d.currencyCode,
          grandTotal: Number(d.grandTotal),
        }))
      : (
          await client.vendorBill.findMany({
            where: {
              companyId,
              supplierId: query.partnerId,
              status: 'POSTED',
              deletedAt: null,
            },
            select: {
              id: true,
              billNo: true,
              billDate: true,
              currencyCode: true,
              grandTotal: true,
            },
            orderBy: { billDate: 'asc' },
          })
        ).map((d) => ({
          id: d.id,
          number: d.billNo,
          date: d.billDate,
          currencyCode: d.currencyCode,
          grandTotal: Number(d.grandTotal),
        }));

    const result: OpenItemResponseDto[] = [];
    for (const d of docs) {
      const allocated = await this.allocatedOriginal(
        client,
        companyId,
        docType,
        d.id,
      );
      const balance = round2(d.grandTotal - allocated);
      if (balance <= EPS) continue;
      result.push({
        documentType: docType,
        documentId: d.id,
        number: d.number,
        date: d.date,
        currencyCode: d.currencyCode,
        grandTotal: d.grandTotal,
        allocatedOriginal: allocated,
        balanceOriginal: balance,
      });
    }
    return result;
  }

  // --- helpers ---------------------------------------------------------------

  private async getOwned(id: string, caller: AuthenticatedUser) {
    const payment = await this.clientFor(caller).payment.findFirst({
      where: { id, deletedAt: null },
      include: PAYMENT_INCLUDE,
    });
    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: `Payment ${id} was not found.`,
        field: null,
      });
    }
    return payment;
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
  ) {
    const account = await tx.account.findFirst({
      where: { companyId, controlType, deletedAt: null },
    });
    if (!account) {
      throw new BadRequestException({
        code: `${controlType}_ACCOUNT_MISSING`,
        message: `No ${controlType} control account is configured for this company.`,
        field: null,
      });
    }
    return account;
  }

  private async assertBranch(
    tx: Prisma.TransactionClient,
    branchId: string,
    companyId: string,
  ): Promise<void> {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException({
        code: 'BRANCH_NOT_FOUND',
        message: `Branch ${branchId} was not found.`,
        field: 'branchId',
      });
    }
  }

  /** Load a POSTED settleable document (sales invoice or vendor bill). */
  private async loadOpenDocument(
    tx: Prisma.TransactionClient,
    companyId: string,
    direction: PaymentDirection,
    documentId: string,
  ): Promise<{
    id: string;
    number: string;
    partnerId: string;
    currencyCode: string;
    rate: Prisma.Decimal;
    grandTotal: Prisma.Decimal;
  }> {
    if (direction === PaymentDirection.IN) {
      const inv = await tx.salesInvoice.findFirst({
        where: { id: documentId, companyId, deletedAt: null },
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          customerId: true,
          currencyCode: true,
          rate: true,
          grandTotal: true,
        },
      });
      if (!inv) throw this.docNotFound(documentId);
      if (inv.status !== 'POSTED') throw this.docNotPosted(inv.invoiceNo);
      return {
        id: inv.id,
        number: inv.invoiceNo,
        partnerId: inv.customerId,
        currencyCode: inv.currencyCode,
        rate: inv.rate,
        grandTotal: inv.grandTotal,
      };
    }
    const bill = await tx.vendorBill.findFirst({
      where: { id: documentId, companyId, deletedAt: null },
      select: {
        id: true,
        billNo: true,
        status: true,
        supplierId: true,
        currencyCode: true,
        rate: true,
        grandTotal: true,
      },
    });
    if (!bill) throw this.docNotFound(documentId);
    if (bill.status !== 'POSTED') throw this.docNotPosted(bill.billNo);
    return {
      id: bill.id,
      number: bill.billNo,
      partnerId: bill.supplierId,
      currencyCode: bill.currencyCode,
      rate: bill.rate,
      grandTotal: bill.grandTotal,
    };
  }

  private docNotFound(id: string): NotFoundException {
    return new NotFoundException({
      code: 'DOCUMENT_NOT_FOUND',
      message: `Document ${id} was not found.`,
      field: 'allocations',
    });
  }

  private docNotPosted(number: string): BadRequestException {
    return new BadRequestException({
      code: 'DOCUMENT_NOT_POSTED',
      message: `Document ${number} is not posted and cannot be settled.`,
      field: 'allocations',
    });
  }

  private async openBalanceOriginal(
    tx: Prisma.TransactionClient,
    companyId: string,
    documentType: DocumentType,
    documentId: string,
    grandTotal: number,
  ): Promise<number> {
    const allocated = await this.allocatedOriginal(
      tx,
      companyId,
      documentType,
      documentId,
    );
    return round2(grandTotal - allocated);
  }

  /** Sum of prior POSTED allocations against a document, in its own currency. */
  private async allocatedOriginal(
    tx: Prisma.TransactionClient,
    companyId: string,
    documentType: DocumentType,
    documentId: string,
  ): Promise<number> {
    const agg = await tx.paymentAllocation.aggregate({
      _sum: { amountOriginal: true },
      where: {
        companyId,
        documentType,
        documentId,
        payment: { status: PaymentStatus.POSTED, deletedAt: null },
      },
    });
    return round2(Number(agg._sum.amountOriginal ?? 0));
  }
}
