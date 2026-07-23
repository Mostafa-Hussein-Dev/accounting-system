import { ConflictException, Injectable } from '@nestjs/common';
import { DocumentType, JournalSide, JournalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SequencesService } from '../sequences/sequences.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { GlService } from './gl.service';
import { ReverseJournalEntryDto } from './dto/reverse-journal-entry.dto';
import { JournalEntryResponseDto } from './dto/journal-entry-response.dto';

/**
 * The posting engine (FR-901/FR-906): the one place a journal entry becomes
 * part of the ledger. Manual entries post through here; documents (invoices,
 * payments, …) will call the same methods when they are built (FR-902), which
 * is why post/reverse live in their own service rather than in GlService.
 */
@Injectable()
export class PostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequencesService,
    private readonly gl: GlService,
  ) {}

  /**
   * Post a DRAFT entry: assign its official number from the JOURNAL_ENTRY
   * sequence (gap-controlled, inside the transaction) and flip it to POSTED.
   * The DB balance trigger validates Σdebit == Σcredit at commit.
   */
  async post(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<JournalEntryResponseDto> {
    const entry = await this.gl.getOwned(id, caller);
    if (entry.status !== JournalStatus.DRAFT) {
      throw new ConflictException({
        code: 'JOURNAL_ENTRY_ALREADY_POSTED',
        message: `Journal entry ${entry.entryNumber ?? entry.id} is already posted.`,
        field: null,
      });
    }

    // TODO(FR-904): once fiscal periods exist, reject posting into a locked
    // period here (docs/DEFERRED.md — period locking).

    await this.prisma.$transaction(async (tx) => {
      const entryNumber = await this.sequences.nextNumber(
        entry.companyId,
        entry.branchId,
        DocumentType.JOURNAL_ENTRY,
        entry.date,
        tx,
      );
      await tx.journalEntry.update({
        where: { id: entry.id },
        data: {
          status: JournalStatus.POSTED,
          entryNumber,
          postedAt: new Date(),
          postedById: caller.userId,
        },
      });
    });

    return this.gl.findOne(id, caller);
  }

  /**
   * Reverse a POSTED entry (FR-901): create a new POSTED entry with the same
   * lines but swapped sides, copying the ORIGINAL frozen base amounts so the two
   * net to zero (invariant #6 — today’s rate is never re-applied). An entry can
   * be reversed at most once.
   */
  async reverse(
    id: string,
    dto: ReverseJournalEntryDto,
    caller: AuthenticatedUser,
  ): Promise<JournalEntryResponseDto> {
    const entry = await this.gl.getOwned(id, caller);
    if (entry.status !== JournalStatus.POSTED) {
      throw new ConflictException({
        code: 'JOURNAL_ENTRY_NOT_POSTED',
        message: `Only a posted journal entry can be reversed; ${entry.entryNumber ?? entry.id} is a draft.`,
        field: null,
      });
    }
    const alreadyReversed = await this.prisma.journalEntry.findFirst({
      where: { reversalOfId: entry.id },
      select: { id: true, entryNumber: true },
    });
    if (alreadyReversed) {
      throw new ConflictException({
        code: 'JOURNAL_ENTRY_ALREADY_REVERSED',
        message: `Journal entry ${entry.entryNumber ?? entry.id} was already reversed by ${alreadyReversed.entryNumber ?? alreadyReversed.id}.`,
        field: null,
      });
    }

    const reversalDate = dto.date ? new Date(dto.date) : new Date();
    const description =
      dto.reason ?? `Reversal of ${entry.entryNumber ?? entry.id}`;

    const reversal = await this.prisma.$transaction(async (tx) => {
      const entryNumber = await this.sequences.nextNumber(
        entry.companyId,
        entry.branchId,
        DocumentType.JOURNAL_ENTRY,
        reversalDate,
        tx,
      );
      return tx.journalEntry.create({
        data: {
          companyId: entry.companyId,
          branchId: entry.branchId,
          entryNumber,
          date: reversalDate,
          reference: entry.reference,
          description,
          status: JournalStatus.POSTED,
          reversalOfId: entry.id,
          postedAt: new Date(),
          postedById: caller.userId,
          createdById: caller.userId,
          lines: {
            create: entry.lines.map((l) => ({
              companyId: entry.companyId,
              lineNo: l.lineNo,
              accountId: l.accountId,
              side:
                l.side === JournalSide.DEBIT
                  ? JournalSide.CREDIT
                  : JournalSide.DEBIT,
              amountOriginal: l.amountOriginal,
              currency: l.currency,
              rate: l.rate,
              amountBase: l.amountBase,
              partnerId: l.partnerId,
              costCenterId: l.costCenterId,
              description: l.description,
            })),
          },
        },
      });
    });

    return this.gl.findOne(reversal.id, caller);
  }
}
