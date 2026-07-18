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
import { ExchangeRatesService } from './exchange-rates.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { UpdateExchangeRateDto } from './dto/update-exchange-rate.dto';
import { QueryExchangeRateDto } from './dto/query-exchange-rate.dto';
import { CurrentExchangeRateDto } from './dto/current-exchange-rate.dto';
import { ExchangeRateResponseDto } from './dto/exchange-rate-response.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Exchange Rates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'ExchangeRate' })
  @ApiOperation({
    summary:
      'Record a dated exchange rate. Company-scoped caller: forced into their own company. Platform admin: target a company via body companyId.',
  })
  @ApiResponse({
    status: 201,
    description: 'Exchange rate created',
    type: ExchangeRateResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Currency or company not found' })
  @ApiResponse({
    status: 409,
    description: 'A rate for this currency/type/date already exists',
  })
  create(
    @Body() dto: CreateExchangeRateDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ExchangeRateResponseDto> {
    return this.exchangeRatesService.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'ExchangeRate' })
  @ApiOperation({
    summary:
      'List exchange-rate history, filterable by currency, rate type, and effective-date range.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of exchange rates',
    type: ExchangeRateResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @Query() query: QueryExchangeRateDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<ExchangeRateResponseDto>> {
    return this.exchangeRatesService.findAll(query, caller);
  }

  // Declared before :id so "current" is never parsed as an id.
  @Get('current')
  @RequirePermissions({ action: 'read', subject: 'ExchangeRate' })
  @ApiOperation({
    summary:
      'Get the rate in force on a date (default today) for a currency + rate type — the default a document uses before any operator override.',
  })
  @ApiResponse({
    status: 200,
    description: 'The in-force exchange rate',
    type: ExchangeRateResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'No rate in force for that date' })
  findCurrent(
    @Query() query: CurrentExchangeRateDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ExchangeRateResponseDto> {
    return this.exchangeRatesService.findCurrent(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'ExchangeRate' })
  @ApiOperation({ summary: 'Get an exchange rate by id' })
  @ApiResponse({
    status: 200,
    description: 'Exchange rate found',
    type: ExchangeRateResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Exchange rate not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ExchangeRateResponseDto> {
    return this.exchangeRatesService.findOne(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'ExchangeRate' })
  @ApiOperation({
    summary: 'Update an exchange rate (e.g. correct a mistyped rate)',
  })
  @ApiResponse({
    status: 200,
    description: 'Exchange rate updated',
    type: ExchangeRateResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({
    status: 404,
    description: 'Exchange rate or currency not found',
  })
  @ApiResponse({ status: 409, description: 'Duplicate currency/type/date' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExchangeRateDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ExchangeRateResponseDto> {
    return this.exchangeRatesService.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'ExchangeRate' })
  @ApiOperation({
    summary: 'Hard delete an exchange rate (configuration data)',
  })
  @ApiResponse({ status: 204, description: 'Exchange rate deleted' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Exchange rate not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.exchangeRatesService.remove(id, caller);
  }
}
