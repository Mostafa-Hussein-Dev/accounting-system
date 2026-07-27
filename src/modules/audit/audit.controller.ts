import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { AuditLogResponseDto } from './dto/audit-log-response.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions({ action: 'read', subject: 'AuditLog' })
  @ApiOperation({
    summary:
      'List audit-trail entries, filterable by entity, entity id, user, action, and date range. Requires audit.read (Company Admin). A company caller only sees their active company; a platform admin sees across tenants and may narrow with ?companyId.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated audit log',
    type: AuditLogResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @Query() query: QueryAuditLogsDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<AuditLogResponseDto>> {
    return this.audit.findAll(query, caller);
  }
}
