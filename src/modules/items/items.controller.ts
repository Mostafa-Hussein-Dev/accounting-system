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
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemDto } from './dto/query-item.dto';
import { ItemResponseDto } from './dto/item-response.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Item' })
  @ApiOperation({
    summary:
      'Create an item (Odoo product.template). baseUomId is required; sales/purchase UoMs must share its category. priceCurrency defaults to the company base currency; vatTreatment + defaultTaxRateId set the item VAT default.',
  })
  @ApiResponse({ status: 201, type: ItemResponseDto })
  @ApiResponse({ status: 400, description: 'UoM category mismatch' })
  @ApiResponse({
    status: 404,
    description: 'A referenced lookup/uom/currency/tax rate was not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Item code already exists in this company',
  })
  create(
    @Body() dto: CreateItemDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ItemResponseDto> {
    return this.items.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Item' })
  @ApiOperation({
    summary:
      'List items, filterable by category/brand/family/active and a code/name search (q).',
  })
  @ApiResponse({ status: 200, type: ItemResponseDto, isArray: true })
  findAll(
    @Query() query: QueryItemDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<ItemResponseDto>> {
    return this.items.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Item' })
  @ApiResponse({ status: 200, type: ItemResponseDto })
  @ApiResponse({ status: 404, description: 'Item not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ItemResponseDto> {
    return this.items.findOne(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Item' })
  @ApiResponse({ status: 200, type: ItemResponseDto })
  @ApiResponse({ status: 409, description: 'Item code already exists' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ItemResponseDto> {
    return this.items.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Item' })
  @ApiResponse({ status: 204, description: 'Item soft-deleted' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.items.remove(id, caller);
  }
}
