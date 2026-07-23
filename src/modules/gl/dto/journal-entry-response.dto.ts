import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  JournalEntry,
  JournalLine,
  JournalSide,
  JournalStatus,
} from '@prisma/client';

type JournalEntryWithLines = JournalEntry & { lines: JournalLine[] };

export class JournalLineResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  id!: string;

  @ApiProperty({ example: 1 })
  lineNo!: number;

  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  accountId!: string;

  @ApiProperty({ enum: JournalSide, example: JournalSide.DEBIT })
  side!: JournalSide;

  @ApiProperty({ description: 'Amount in the original currency', example: 100 })
  amountOriginal!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ description: 'Currency units per 1 USD', example: 1 })
  rate!: number;

  @ApiProperty({ description: 'Equivalent in the base currency', example: 100 })
  amountBase!: number;

  @ApiPropertyOptional({ nullable: true, example: null })
  partnerId!: string | null;

  @ApiPropertyOptional({ nullable: true, example: null })
  costCenterId!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Cash sale' })
  description!: string | null;

  static fromEntity(this: void, line: JournalLine): JournalLineResponseDto {
    const dto = new JournalLineResponseDto();
    dto.id = line.id;
    dto.lineNo = line.lineNo;
    dto.accountId = line.accountId;
    dto.side = line.side;
    dto.amountOriginal = Number(line.amountOriginal);
    dto.currency = line.currency;
    dto.rate = Number(line.rate);
    dto.amountBase = Number(line.amountBase);
    dto.partnerId = line.partnerId;
    dto.costCenterId = line.costCenterId;
    dto.description = line.description;
    return dto;
  }
}

export class JournalEntryResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiProperty({ example: '586b91ef-6b89-4e9b-bcaa-99976d65fc4a' })
  companyId!: string;

  @ApiPropertyOptional({ nullable: true, example: null })
  branchId!: string | null;

  @ApiPropertyOptional({
    description: 'Assigned at posting; null while draft.',
    nullable: true,
    example: 'JE-2026-0001',
  })
  entryNumber!: string | null;

  @ApiProperty({ example: '2026-07-23T00:00:00.000Z' })
  date!: Date;

  @ApiPropertyOptional({ nullable: true, example: 'ADJ-2026-07' })
  reference!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Month-end depreciation' })
  description!: string | null;

  @ApiProperty({ enum: JournalStatus, example: JournalStatus.DRAFT })
  status!: JournalStatus;

  @ApiPropertyOptional({
    description: 'The entry this one reverses (if it is a reversal).',
    nullable: true,
    example: null,
  })
  reversalOfId!: string | null;

  @ApiProperty({ description: 'Sum of debit base amounts', example: 100 })
  totalDebitBase!: number;

  @ApiProperty({ description: 'Sum of credit base amounts', example: 100 })
  totalCreditBase!: number;

  @ApiProperty({
    description: 'Whether base-currency debits equal credits.',
    example: true,
  })
  isBalanced!: boolean;

  @ApiProperty({ type: JournalLineResponseDto, isArray: true })
  lines!: JournalLineResponseDto[];

  @ApiPropertyOptional({ nullable: true, example: null })
  postedAt!: Date | null;

  @ApiProperty({ example: '2026-07-23T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-23T00:00:00.000Z' })
  updatedAt!: Date;

  static fromEntity(
    this: void,
    entry: JournalEntryWithLines,
  ): JournalEntryResponseDto {
    const dto = new JournalEntryResponseDto();
    dto.id = entry.id;
    dto.companyId = entry.companyId;
    dto.branchId = entry.branchId;
    dto.entryNumber = entry.entryNumber;
    dto.date = entry.date;
    dto.reference = entry.reference;
    dto.description = entry.description;
    dto.status = entry.status;
    dto.reversalOfId = entry.reversalOfId;

    const lines = [...entry.lines].sort((a, b) => a.lineNo - b.lineNo);
    dto.lines = lines.map(JournalLineResponseDto.fromEntity);
    dto.totalDebitBase = round2(
      lines
        .filter((l) => l.side === JournalSide.DEBIT)
        .reduce((sum, l) => sum + Number(l.amountBase), 0),
    );
    dto.totalCreditBase = round2(
      lines
        .filter((l) => l.side === JournalSide.CREDIT)
        .reduce((sum, l) => sum + Number(l.amountBase), 0),
    );
    dto.isBalanced = dto.totalDebitBase === dto.totalCreditBase;

    dto.postedAt = entry.postedAt;
    dto.createdAt = entry.createdAt;
    dto.updatedAt = entry.updatedAt;
    return dto;
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
