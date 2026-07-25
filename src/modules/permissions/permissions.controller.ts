import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { PermissionResponseDto } from './dto/permission-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Permission' })
  @ApiOperation({
    summary:
      'List every permission (id + key + subject + action + description), for building/editing custom roles. Requires permission.read (Company Admin).',
  })
  @ApiResponse({
    status: 200,
    description: 'All permissions',
    type: PermissionResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(): Promise<PermissionResponseDto[]> {
    return this.permissionsService.findAll();
  }
}
