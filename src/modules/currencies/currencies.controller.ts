import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { CurrencyResponseDto } from './dto/currency-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Currencies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Currency' })
  @ApiOperation({
    summary:
      'Define a currency. Currencies are global reference data shared by every tenant.',
  })
  @ApiResponse({
    status: 201,
    description: 'Currency created',
    type: CurrencyResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 409, description: 'Currency code already exists' })
  create(@Body() dto: CreateCurrencyDto): Promise<CurrencyResponseDto> {
    return this.currenciesService.create(dto);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Currency' })
  @ApiOperation({ summary: 'List currencies' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of currencies',
    type: CurrencyResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<CurrencyResponseDto>> {
    return this.currenciesService.findAll(query);
  }

  @Get(':code')
  @RequirePermissions({ action: 'read', subject: 'Currency' })
  @ApiOperation({ summary: 'Get a currency by its ISO 4217 code' })
  @ApiResponse({
    status: 200,
    description: 'Currency found',
    type: CurrencyResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Currency not found' })
  findOne(@Param('code') code: string): Promise<CurrencyResponseDto> {
    return this.currenciesService.findOne(code);
  }

  @Patch(':code')
  @RequirePermissions({ action: 'update', subject: 'Currency' })
  @ApiOperation({
    summary: 'Update a currency (also used to deactivate via isActive)',
  })
  @ApiResponse({
    status: 200,
    description: 'Currency updated',
    type: CurrencyResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Currency not found' })
  update(
    @Param('code') code: string,
    @Body() dto: UpdateCurrencyDto,
  ): Promise<CurrencyResponseDto> {
    return this.currenciesService.update(code, dto);
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Currency' })
  @ApiOperation({
    summary:
      'Hard delete a currency (configuration table). Blocked if any exchange rate references it.',
  })
  @ApiResponse({ status: 204, description: 'Currency deleted' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Currency not found' })
  @ApiResponse({
    status: 409,
    description: 'Currency is referenced by exchange rates',
  })
  remove(@Param('code') code: string): Promise<void> {
    return this.currenciesService.remove(code);
  }
}
