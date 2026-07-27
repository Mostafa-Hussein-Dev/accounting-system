import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JournalLine, JournalEntry, JournalSide } from '@prisma/client';

type LineWithEntry = JournalLine & { journalEntry: JournalEntry };

/**
 * One posted journal line touching the partner — the ledger-derived transaction
 * list that a full statement/relevé (FR-303, with running balance + export) will
 * later build on. Deferred: PDF/Excel export and running balance.
 */
export class PartnerTransactionRowDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  lineId!: string;
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  journalEntryId!: string;
  @ApiPropertyOptional({ nullable: true, example: 'JE-2026-0001' })
  entryNumber!: string | null;
  @ApiProperty({ example: '2026-03-14T00:00:00.000Z' }) date!: Date;
  @ApiPropertyOptional({ nullable: true }) reference!: string | null;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  accountId!: string;
  @ApiProperty({ enum: JournalSide, example: JournalSide.DEBIT })
  side!: JournalSide;
  @ApiProperty({ example: 100 }) amountOriginal!: number;
  @ApiProperty({ example: 'USD' }) currency!: string;
  @ApiProperty({ example: 100 }) amountBase!: number;

  static fromEntity(this: void, l: LineWithEntry): PartnerTransactionRowDto {
    const dto = new PartnerTransactionRowDto();
    dto.lineId = l.id;
    dto.journalEntryId = l.journalEntryId;
    dto.entryNumber = l.journalEntry.entryNumber;
    dto.date = l.journalEntry.date;
    dto.reference = l.journalEntry.reference;
    dto.description = l.description;
    dto.accountId = l.accountId;
    dto.side = l.side;
    dto.amountOriginal = Number(l.amountOriginal);
    dto.currency = l.currency;
    dto.amountBase = Number(l.amountBase);
    return dto;
  }
}
