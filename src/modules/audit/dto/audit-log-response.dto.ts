import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction, AuditLog } from '@prisma/client';

export class AuditLogResponseDto {
  @ApiProperty({ example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab' })
  id!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  companyId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  userId!: string | null;

  @ApiProperty({ enum: AuditAction, example: AuditAction.CREATE })
  action!: AuditAction;

  @ApiProperty({ example: 'JournalEntry' })
  entity!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab',
  })
  entityId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'State before the change (only on service-emitted domain events).',
  })
  before!: unknown;

  @ApiPropertyOptional({
    nullable: true,
    description: 'State after the change (secrets redacted).',
  })
  after!: unknown;

  @ApiPropertyOptional({ nullable: true, example: '127.0.0.1' })
  ip!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'POST' })
  method!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '/api/v1/journal-entries' })
  path!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 201 })
  statusCode!: number | null;

  @ApiProperty({ example: '2026-07-27T12:00:00.000Z' })
  createdAt!: Date;

  static fromEntity(this: void, log: AuditLog): AuditLogResponseDto {
    const dto = new AuditLogResponseDto();
    dto.id = log.id;
    dto.companyId = log.companyId;
    dto.userId = log.userId;
    dto.action = log.action;
    dto.entity = log.entity;
    dto.entityId = log.entityId;
    dto.before = log.before ?? null;
    dto.after = log.after ?? null;
    dto.ip = log.ip;
    dto.method = log.method;
    dto.path = log.path;
    dto.statusCode = log.statusCode;
    dto.createdAt = log.createdAt;
    return dto;
  }
}
