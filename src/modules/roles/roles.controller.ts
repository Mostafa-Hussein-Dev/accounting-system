import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleResponseDto } from './dto/role-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Role' })
  @ApiOperation({
    summary:
      "List roles (platform admin sees every role; a company-scoped caller sees global roles plus their own company's custom roles)",
  })
  @ApiResponse({
    status: 200,
    description: 'List of roles',
    type: RoleResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<RoleResponseDto[]> {
    return this.rolesService.findAll(caller);
  }

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Role' })
  @ApiOperation({
    summary:
      'Create a role. Platform admin: omit companyId for a global role, or supply one to create a custom role on behalf of that company. Company-scoped caller: always forced into their own company.',
  })
  @ApiResponse({
    status: 201,
    description: 'Role created',
    type: RoleResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({
    status: 404,
    description: 'A permissionId (or companyId) was not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Role name already exists in this scope',
  })
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<RoleResponseDto> {
    return this.rolesService.create(dto, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Role' })
  @ApiOperation({
    summary:
      "Update a role. Platform admin can update any non-system role; a company-scoped caller only their own company's custom roles. System roles (the seeded Company Admin/Company Member) can never be updated.",
  })
  @ApiResponse({
    status: 200,
    description: 'Role updated',
    type: RoleResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Permission denied, no access to this role, or system role',
  })
  @ApiResponse({ status: 404, description: 'Role or permissionId not found' })
  @ApiResponse({
    status: 409,
    description: 'Role name already exists in this scope',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<RoleResponseDto> {
    return this.rolesService.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Role' })
  @ApiOperation({
    summary:
      "Delete a role. Platform admin can delete any non-system role; a company-scoped caller only their own company's custom roles. Blocked if the role is a system role or currently assigned to any user.",
  })
  @ApiResponse({ status: 204, description: 'Role deleted' })
  @ApiResponse({
    status: 403,
    description: 'Permission denied, no access to this role, or system role',
  })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({
    status: 409,
    description: 'Role is currently assigned to a user',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.rolesService.remove(id, caller);
  }
}
