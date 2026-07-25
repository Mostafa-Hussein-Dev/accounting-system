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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchResponseDto } from './dto/branch-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Branch' })
  @ApiOperation({
    summary:
      'Create a branch. Company-scoped caller: forced into their own company. Platform admin: target a company via body companyId.',
  })
  @ApiResponse({
    status: 201,
    description: 'Branch created',
    type: BranchResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  create(
    @Body() dto: CreateBranchDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<BranchResponseDto> {
    return this.branchesService.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Branch' })
  @ApiOperation({
    summary:
      'List branches (platform admin: any company via ?companyId; company-scoped caller: their own company only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of branches',
    type: BranchResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<BranchResponseDto>> {
    return this.branchesService.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Branch' })
  @ApiOperation({ summary: 'Get a branch by id' })
  @ApiResponse({
    status: 200,
    description: 'Branch found',
    type: BranchResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<BranchResponseDto> {
    return this.branchesService.findOne(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Branch' })
  @ApiOperation({ summary: 'Update a branch (also used to deactivate via isActive)' })
  @ApiResponse({
    status: 200,
    description: 'Branch updated',
    type: BranchResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<BranchResponseDto> {
    return this.branchesService.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Branch' })
  @ApiOperation({ summary: 'Soft delete a branch' })
  @ApiResponse({ status: 204, description: 'Branch deleted' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.branchesService.remove(id, caller);
  }
}
