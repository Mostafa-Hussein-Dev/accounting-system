import { Prisma } from '@prisma/client';
import {
  PaymentAllocationResponseDto,
  PaymentResponseDto,
} from './dto/payment.dto';

export const PAYMENT_INCLUDE = {
  allocations: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.PaymentInclude;

type PaymentWithAllocations = Prisma.PaymentGetPayload<{
  include: typeof PAYMENT_INCLUDE;
}>;
type AllocationEntity = PaymentWithAllocations['allocations'][number];

function toAllocation(a: AllocationEntity): PaymentAllocationResponseDto {
  return {
    id: a.id,
    documentType: a.documentType,
    documentId: a.documentId,
    amountOriginal: Number(a.amountOriginal),
    amountBase: Number(a.amountBase),
  };
}

export function toPaymentResponse(
  p: PaymentWithAllocations,
): PaymentResponseDto {
  return {
    id: p.id,
    companyId: p.companyId,
    paymentNo: p.paymentNo,
    direction: p.direction,
    method: p.method,
    status: p.status,
    partnerId: p.partnerId,
    cashAccountId: p.cashAccountId,
    branchId: p.branchId,
    currencyCode: p.currencyCode,
    rate: Number(p.rate),
    baseCurrencyCode: p.baseCurrencyCode,
    amountOriginal: Number(p.amountOriginal),
    amountBase: Number(p.amountBase),
    reference: p.reference,
    paymentDate: p.paymentDate,
    notes: p.notes,
    journalEntryId: p.journalEntryId,
    postedAt: p.postedAt,
    voidedAt: p.voidedAt,
    allocations: p.allocations.map(toAllocation),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
