import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentSequence,
  DocumentType,
  Prisma,
  ResetPeriod,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CreateDocumentSequenceDto } from './dto/create-document-sequence.dto';
import { UpdateDocumentSequenceDto } from './dto/update-document-sequence.dto';
import { QueryDocumentSequenceDto } from './dto/query-document-sequence.dto';
import { DocumentSequenceResponseDto } from './dto/document-sequence-response.dto';
import { PreviewNumberDto } from './dto/preview-number.dto';

const PRISMA_FOREIGN_KEY_CONSTRAINT = 'P2003';
const ALLOWED_SORT_FIELDS = [
  'docType',
  'prefix',
  'nextNumber',
  'createdAt',
  'updatedAt',
];

// The set of series a fresh company starts with (FR-106) so it can issue any
// core document immediately. All company-wide (branchId null), yearly reset.
const DEFAULT_SEQUENCES: { docType: DocumentType; prefix: string }[] = [
  { docType: DocumentType.SALES_INVOICE, prefix: 'INV-' },
  { docType: DocumentType.SALES_ORDER, prefix: 'SO-' },
  { docType: DocumentType.QUOTATION, prefix: 'QUO-' },
  { docType: DocumentType.DELIVERY_NOTE, prefix: 'DN-' },
  { docType: DocumentType.CREDIT_NOTE, prefix: 'CN-' },
  { docType: DocumentType.PURCHASE_ORDER, prefix: 'PO-' },
  { docType: DocumentType.PAYMENT_RECEIPT, prefix: 'REC-' },
  { docType: DocumentType.JOURNAL_ENTRY, prefix: 'JE-' },
];

@Injectable()
export class SequencesService {
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
    dto: CreateDocumentSequenceDto,
    caller: AuthenticatedUser,
  ): Promise<DocumentSequenceResponseDto> {
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    if (dto.branchId) {
      await this.assertBranchExists(dto.branchId, companyId);
    }
    await this.assertNotDuplicate(companyId, dto.branchId ?? null, dto.docType);

    try {
      const seq = await this.prisma.documentSequence.create({
        data: {
          companyId,
          branchId: dto.branchId ?? null,
          docType: dto.docType,
          prefix: dto.prefix ?? '',
          suffix: dto.suffix ?? '',
          padWidth: dto.padWidth ?? 4,
          resetPeriod: dto.resetPeriod ?? ResetPeriod.YEARLY,
          nextNumber: dto.nextNumber ?? 1,
        },
      });
      return DocumentSequenceResponseDto.fromEntity(seq);
    } catch (error) {
      throw this.mapWriteError(error, companyId);
    }
  }

  async findAll(
    query: QueryDocumentSequenceDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<DocumentSequenceResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'docType';
    const where: Prisma.DocumentSequenceWhereInput = {};
    if (query.docType) {
      where.docType = query.docType;
    }
    if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.companyId) {
      where.companyId = query.companyId;
    }
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.DocumentSequenceOrderByWithRelationInput;
    const client = this.clientFor(caller);

    const [rows, total] = await this.prisma.$transaction([
      client.documentSequence.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      client.documentSequence.count({ where }),
    ]);

    return Paginated.of(
      rows.map(DocumentSequenceResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<DocumentSequenceResponseDto> {
    return DocumentSequenceResponseDto.fromEntity(
      await this.getOwned(id, caller),
    );
  }

  /** Show the next number without consuming it (for the UI). Read-only. */
  async preview(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<PreviewNumberDto> {
    const seq = await this.getOwned(id, caller);
    const periodKey = this.periodKeyFor(new Date(), seq.resetPeriod);
    const n = seq.periodKey === periodKey ? seq.nextNumber : 1;
    return { number: this.format(seq, periodKey, n) };
  }

  async update(
    id: string,
    dto: UpdateDocumentSequenceDto,
    caller: AuthenticatedUser,
  ): Promise<DocumentSequenceResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (dto.branchId) {
      await this.assertBranchExists(dto.branchId, existing.companyId);
    }
    const client = this.clientFor(caller);
    try {
      const seq = await client.documentSequence.update({
        where: { id },
        data: {
          branchId: dto.branchId,
          docType: dto.docType,
          prefix: dto.prefix,
          suffix: dto.suffix,
          padWidth: dto.padWidth,
          resetPeriod: dto.resetPeriod,
          nextNumber: dto.nextNumber,
          isActive: dto.isActive,
        },
      });
      return DocumentSequenceResponseDto.fromEntity(seq);
    } catch (error) {
      throw this.mapWriteError(error, existing.companyId);
    }
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.getOwned(id, caller);
    // Configuration data — hard delete is allowed (docs/MODELS.md).
    await this.clientFor(caller).documentSequence.delete({ where: { id } });
  }

  /**
   * Hand out the next number for a document, atomically and gap-controlled
   * (FR-106). MUST run inside the document-creation transaction: it locks the
   * sequence row (SELECT ... FOR UPDATE) so concurrent callers serialize and
   * never get a duplicate or skip a number. Resolves a branch-specific series
   * first, then falls back to the company-wide (branchId null) one. Resets the
   * counter when documentDate crosses into a new period.
   *
   * Not exposed over HTTP — a document must consume the number so it is never
   * wasted (which would create a gap). Documents call this once they exist
   * (see docs/DEFERRED.md).
   */
  async nextNumber(
    companyId: string,
    branchId: string | null,
    docType: DocumentType,
    documentDate: Date,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const resolved = await this.resolveSequence(
      companyId,
      branchId,
      docType,
      tx,
    );
    if (!resolved) {
      throw new NotFoundException({
        code: 'SEQUENCE_NOT_FOUND',
        message: `No active ${docType} sequence is configured for this company.`,
        field: null,
      });
    }

    // Lock the row for the rest of the transaction so a concurrent nextNumber()
    // for the same series waits here rather than reading the same counter.
    await tx.$queryRaw`SELECT id FROM document_sequences WHERE id = ${resolved.id}::uuid FOR UPDATE`;
    const seq = await tx.documentSequence.findUniqueOrThrow({
      where: { id: resolved.id },
    });

    const periodKey = this.periodKeyFor(documentDate, seq.resetPeriod);
    const n = seq.periodKey === periodKey ? seq.nextNumber : 1;
    const number = this.format(seq, periodKey, n);

    await tx.documentSequence.update({
      where: { id: seq.id },
      data: { nextNumber: n + 1, periodKey },
    });
    return number;
  }

  /**
   * Seed a company's default document series (FR-106). Idempotent — skips a
   * docType that already has a company-wide series. Called from
   * AuthService.register in the same transaction. Returns how many were created.
   */
  async applyDefaultSequences(
    companyId: string,
    client: Prisma.TransactionClient,
  ): Promise<number> {
    const existing = await client.documentSequence.findMany({
      where: { companyId, branchId: null },
      select: { docType: true },
    });
    const have = new Set(existing.map((e) => e.docType));
    const toCreate = DEFAULT_SEQUENCES.filter((s) => !have.has(s.docType));
    if (toCreate.length === 0) {
      return 0;
    }
    await client.documentSequence.createMany({
      data: toCreate.map((s) => ({
        companyId,
        docType: s.docType,
        prefix: s.prefix,
        resetPeriod: ResetPeriod.YEARLY,
        padWidth: 4,
        nextNumber: 1,
      })),
    });
    return toCreate.length;
  }

  // --- helpers ---

  private async resolveSequence(
    companyId: string,
    branchId: string | null,
    docType: DocumentType,
    client: Prisma.TransactionClient,
  ): Promise<DocumentSequence | null> {
    if (branchId) {
      const branchSeq = await client.documentSequence.findFirst({
        where: { companyId, branchId, docType, isActive: true },
      });
      if (branchSeq) {
        return branchSeq;
      }
    }
    return client.documentSequence.findFirst({
      where: { companyId, branchId: null, docType, isActive: true },
    });
  }

  private periodKeyFor(date: Date, reset: ResetPeriod): string {
    if (reset === ResetPeriod.NONE) {
      return 'ALL';
    }
    const year = date.getUTCFullYear();
    if (reset === ResetPeriod.YEARLY) {
      return String(year);
    }
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private format(seq: DocumentSequence, periodKey: string, n: number): string {
    const padded = String(n).padStart(seq.padWidth, '0');
    const token = seq.resetPeriod === ResetPeriod.NONE ? '' : periodKey;
    const core = token ? `${token}-${padded}` : padded;
    return `${seq.prefix}${core}${seq.suffix}`;
  }

  private resolveCompanyId(
    dtoCompanyId: string | undefined,
    caller: AuthenticatedUser,
  ): string {
    if (!isPlatformAdmin(caller)) {
      return caller.companyId as string;
    }
    if (!dtoCompanyId) {
      throw new BadRequestException({
        code: 'COMPANY_ID_REQUIRED',
        message:
          'A platform admin must specify companyId when creating a sequence.',
        field: 'companyId',
      });
    }
    return dtoCompanyId;
  }

  private async getOwned(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<DocumentSequence> {
    const seq = await this.clientFor(caller).documentSequence.findFirst({
      where: { id },
    });
    if (!seq) {
      throw new NotFoundException({
        code: 'SEQUENCE_NOT_FOUND',
        message: `Document sequence with id ${id} was not found.`,
        field: null,
      });
    }
    return seq;
  }

  private async assertBranchExists(
    branchId: string,
    companyId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
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

  private async assertNotDuplicate(
    companyId: string,
    branchId: string | null,
    docType: DocumentType,
  ): Promise<void> {
    // The [companyId, branchId, docType] unique constraint can't enforce this
    // for a null branch (Postgres treats NULL as distinct), so check explicitly.
    const dup = await this.prisma.documentSequence.findFirst({
      where: { companyId, branchId, docType },
    });
    if (dup) {
      throw new ConflictException({
        code: 'SEQUENCE_ALREADY_EXISTS',
        message: `A ${docType} sequence already exists for this ${branchId ? 'branch' : 'company'}.`,
        field: 'docType',
      });
    }
  }

  private mapWriteError(error: unknown, companyId: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === PRISMA_FOREIGN_KEY_CONSTRAINT) {
        return new NotFoundException({
          code: 'COMPANY_NOT_FOUND',
          message: `Company with id ${companyId} was not found.`,
          field: 'companyId',
        });
      }
    }
    return error;
  }
}
