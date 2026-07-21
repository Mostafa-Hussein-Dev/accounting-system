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
import { TaxesService } from './taxes.service';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';
import { QueryTaxRateDto } from './dto/query-tax-rate.dto';
import { CurrentTaxRateDto } from './dto/current-tax-rate.dto';
import { TaxRateResponseDto } from './dto/tax-rate-response.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Taxes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tax-rates')
export class TaxesController {
  constructor(private readonly taxesService: TaxesService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'TaxRate' })
  @ApiOperation({
    summary:
      'Create a VAT rate. Company-scoped caller: forced into their own company. Platform admin: target a company via body companyId.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tax rate created',
    type: TaxRateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid treatment/rate/VAT-account combination',
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'VAT account or company not found' })
  create(
    @Body() dto: CreateTaxRateDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<TaxRateResponseDto> {
    return this.taxesService.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'TaxRate' })
  @ApiOperation({ summary: 'List VAT rates, filterable by treatment.' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of tax rates',
    type: TaxRateResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @Query() query: QueryTaxRateDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<TaxRateResponseDto>> {
    return this.taxesService.findAll(query, caller);
  }

  // Declared before :id so "current" is never parsed as an id.
  @Get('current')
  @RequirePermissions({ action: 'read', subject: 'TaxRate' })
  @ApiOperation({
    summary:
      'Get the VAT rate in force on a date (default today) for a treatment — the default a document uses to compute VAT.',
  })
  @ApiResponse({
    status: 200,
    description: 'The in-force tax rate',
    type: TaxRateResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'No rate in force for that date' })
  findCurrent(
    @Query() query: CurrentTaxRateDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<TaxRateResponseDto> {
    return this.taxesService.findCurrent(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'TaxRate' })
  @ApiOperation({ summary: 'Get a tax rate by id' })
  @ApiResponse({
    status: 200,
    description: 'Tax rate found',
    type: TaxRateResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Tax rate not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<TaxRateResponseDto> {
    return this.taxesService.findOne(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'TaxRate' })
  @ApiOperation({
    summary: 'Update a tax rate (also used to deactivate via isActive)',
  })
  @ApiResponse({
    status: 200,
    description: 'Tax rate updated',
    type: TaxRateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid resulting combination' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({
    status: 404,
    description: 'Tax rate or VAT account not found',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxRateDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<TaxRateResponseDto> {
    return this.taxesService.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'TaxRate' })
  @ApiOperation({ summary: 'Hard delete a tax rate (configuration data)' })
  @ApiResponse({ status: 204, description: 'Tax rate deleted' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Tax rate not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.taxesService.remove(id, caller);
  }
}
