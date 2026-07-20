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
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { QueryAccountDto } from './dto/query-account.dto';
import { AccountResponseDto } from './dto/account-response.dto';
import { AccountTreeNodeDto } from './dto/account-tree-node.dto';
import { ImportChartResultDto } from './dto/import-chart-result.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Account' })
  @ApiOperation({
    summary:
      'Create a ledger account. Company-scoped caller: forced into their own company. Platform admin: target a company via body companyId.',
  })
  @ApiResponse({
    status: 201,
    description: 'Account created',
    type: AccountResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({
    status: 404,
    description: 'Parent account, currency, or company not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Account number already exists in this company',
  })
  create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<AccountResponseDto> {
    return this.accountsService.create(dto, caller);
  }

  // Declared before :id so "seed-default" is never parsed as an id.
  @Post('seed-default')
  @RequirePermissions({ action: 'create', subject: 'Account' })
  @ApiOperation({
    summary:
      "Populate the caller's company with the default Plan Comptable Libanais. Idempotent — existing account numbers are skipped. New companies get this automatically at registration.",
  })
  @ApiResponse({
    status: 201,
    description:
      'Accounts created this call (empty if the chart already existed)',
    type: AccountResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'Requires a company-scoped user' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  seedDefault(
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<AccountResponseDto[]> {
    return this.accountsService.seedDefault(caller);
  }

  // Declared before :id so "import-official" is never parsed as an id.
  @Post('import-official')
  @RequirePermissions({ action: 'create', subject: 'Account' })
  @ApiOperation({
    summary:
      "Import the rest of the full official Plan Comptable Libanais into the caller's company (everything beyond the common subset seeded at registration). Allowed once per company.",
  })
  @ApiResponse({
    status: 201,
    description: 'Import result (count of accounts created)',
    type: ImportChartResultDto,
  })
  @ApiResponse({ status: 400, description: 'Requires a company-scoped user' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({
    status: 409,
    description:
      'The official chart has already been imported for this company',
  })
  importOfficial(
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ImportChartResultDto> {
    return this.accountsService.importOfficialChart(caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Account' })
  @ApiOperation({
    summary:
      'List accounts (flat), filterable by class, type, control flag, active flag, parent, and a number/name search.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of accounts',
    type: AccountResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @Query() query: QueryAccountDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<AccountResponseDto>> {
    return this.accountsService.findAll(query, caller);
  }

  @Get('tree')
  @RequirePermissions({ action: 'read', subject: 'Account' })
  @ApiOperation({
    summary:
      'Get the chart of accounts as a nested tree (for roll-up/display).',
  })
  @ApiResponse({
    status: 200,
    description: 'Nested account tree',
    type: AccountTreeNodeDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findTree(
    @Query() query: QueryAccountDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<AccountTreeNodeDto[]> {
    return this.accountsService.findTree(caller, query.companyId);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Account' })
  @ApiOperation({ summary: 'Get an account by id' })
  @ApiResponse({
    status: 200,
    description: 'Account found',
    type: AccountResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<AccountResponseDto> {
    return this.accountsService.findOne(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Account' })
  @ApiOperation({
    summary:
      'Update an account (also used to deactivate via isActive or re-parent)',
  })
  @ApiResponse({
    status: 200,
    description: 'Account updated',
    type: AccountResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid control flags or parent cycle',
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({
    status: 404,
    description: 'Account, parent, or currency not found',
  })
  @ApiResponse({ status: 409, description: 'Account number already exists' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<AccountResponseDto> {
    return this.accountsService.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Account' })
  @ApiOperation({
    summary: 'Soft delete an account (blocked if it has child accounts)',
  })
  @ApiResponse({ status: 204, description: 'Account deleted' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 409, description: 'Account has child accounts' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.accountsService.remove(id, caller);
  }
}
