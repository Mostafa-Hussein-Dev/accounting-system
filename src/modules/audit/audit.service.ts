import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { REDACTED_FIELDS } from './audit.constants';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';

/** A single audit entry to persist. */
export interface AuditRecordInput {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
}

const ALLOWED_SORT_FIELDS = ['createdAt', 'action', 'entity'];

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist one audit row. Two modes:
   * - with a `tx` client (domain events): writes inside the caller's
   *   transaction so the audit row commits or rolls back atomically with the
   *   operation it records, and any failure propagates.
   * - without one (the interceptor / login): best-effort — a write failure is
   *   logged and swallowed so auditing can never break or slow a user request.
   */
  async record(
    input: AuditRecordInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const data: Prisma.AuditLogCreateInput = {
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      before: this.toJson(input.before),
      after: this.toJson(input.after),
      ip: input.ip ?? null,
      method: input.method ?? null,
      path: input.path ?? null,
      statusCode: input.statusCode ?? null,
    };

    if (tx) {
      await tx.auditLog.create({ data });
      return;
    }

    try {
      await this.prisma.auditLog.create({ data });
    } catch (error) {
      this.logger.warn(
        `Failed to write audit log (${input.action} ${input.entity}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async findAll(
    query: QueryAuditLogsDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<AuditLogResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';

    const where: Prisma.AuditLogWhereInput = {};

    // A company-scoped caller only ever sees their active company's trail; a
    // platform admin sees across tenants and may narrow to one via ?companyId.
    if (isPlatformAdmin(caller)) {
      if (query.companyId) {
        where.companyId = query.companyId;
      }
    } else {
      where.companyId = caller.companyId;
    }

    if (query.entity) {
      where.entity = query.entity;
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.action) {
      where.action = query.action;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return Paginated.of(
      rows.map(AuditLogResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  /**
   * Deep-clone into a plain JSON value with any secret fields (passwords,
   * tokens, codes) redacted, so nothing sensitive is ever written to the trail.
   */
  private toJson(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) {
      return Prisma.JsonNull;
    }
    return this.redact(value) as Prisma.InputJsonValue;
  }

  private redact(value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.redact(v));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        out[key] = REDACTED_FIELDS.has(key) ? '[REDACTED]' : this.redact(v);
      }
      return out;
    }
    return value;
  }
}
