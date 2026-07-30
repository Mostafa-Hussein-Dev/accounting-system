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
import { PricingService } from './pricing.service';
import {
  CreatePricelistDto,
  PricelistResponseDto,
  UpdatePricelistDto,
} from './dto/pricelist.dto';
import {
  CreatePricelistLineDto,
  PricelistLineResponseDto,
  ResolvedPriceDto,
  UpdatePricelistLineDto,
} from './dto/pricelist-line.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('pricelists')
export class PricelistsController {
  constructor(private readonly pricing: PricingService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Pricelist' })
  @ApiOperation({
    summary:
      'Create a price list (currency-scoped). Setting isDefault unsets the previous default.',
  })
  @ApiResponse({ status: 201, type: PricelistResponseDto })
  create(
    @Body() dto: CreatePricelistDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PricelistResponseDto> {
    return this.pricing.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Pricelist' })
  @ApiResponse({ status: 200, type: PricelistResponseDto, isArray: true })
  findAll(
    @CurrentUser() caller: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ): Promise<PricelistResponseDto[]> {
    return this.pricing.findAll(caller, companyId);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Pricelist' })
  @ApiResponse({ status: 200, type: PricelistResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PricelistResponseDto> {
    return this.pricing.findOne(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Pricelist' })
  @ApiResponse({ status: 200, type: PricelistResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePricelistDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PricelistResponseDto> {
    return this.pricing.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Pricelist' })
  @ApiResponse({ status: 204 })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.pricing.remove(id, caller);
  }

  // --- lines ---

  @Post(':pricelistId/lines')
  @RequirePermissions({ action: 'update', subject: 'Pricelist' })
  @ApiOperation({
    summary: 'Add a fixed price for an item/variant to the list.',
  })
  @ApiResponse({ status: 201, type: PricelistLineResponseDto })
  @ApiResponse({
    status: 409,
    description: 'A price for this item/variant/qty already exists',
  })
  addLine(
    @Param('pricelistId', ParseUUIDPipe) pricelistId: string,
    @Body() dto: CreatePricelistLineDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PricelistLineResponseDto> {
    return this.pricing.addLine(pricelistId, dto, caller);
  }

  @Get(':pricelistId/lines')
  @RequirePermissions({ action: 'read', subject: 'Pricelist' })
  @ApiResponse({ status: 200, type: PricelistLineResponseDto, isArray: true })
  listLines(
    @Param('pricelistId', ParseUUIDPipe) pricelistId: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PricelistLineResponseDto[]> {
    return this.pricing.listLines(pricelistId, caller);
  }

  @Patch(':pricelistId/lines/:lineId')
  @RequirePermissions({ action: 'update', subject: 'Pricelist' })
  @ApiResponse({ status: 200, type: PricelistLineResponseDto })
  updateLine(
    @Param('pricelistId', ParseUUIDPipe) pricelistId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdatePricelistLineDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PricelistLineResponseDto> {
    return this.pricing.updateLine(pricelistId, lineId, dto, caller);
  }

  @Delete(':pricelistId/lines/:lineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'update', subject: 'Pricelist' })
  @ApiResponse({ status: 204 })
  removeLine(
    @Param('pricelistId', ParseUUIDPipe) pricelistId: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.pricing.removeLine(pricelistId, lineId, caller);
  }
}

@ApiTags('Pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('items/:itemId')
export class ItemPriceController {
  constructor(private readonly pricing: PricingService) {}

  @Get('price')
  @RequirePermissions({ action: 'read', subject: 'Pricelist' })
  @ApiOperation({
    summary:
      "Resolve an item's price: the matching pricelist line (a given pricelistId, else the default list; variant-specific and qty-break aware) or the item's base sale price.",
  })
  @ApiResponse({ status: 200, type: ResolvedPriceDto })
  @ApiResponse({ status: 404, description: 'Item not found' })
  price(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() caller: AuthenticatedUser,
    @Query('pricelistId') pricelistId?: string,
    @Query('variantId') variantId?: string,
    @Query('qty') qty?: string,
  ): Promise<ResolvedPriceDto> {
    return this.pricing.resolvePrice(itemId, caller, {
      pricelistId: pricelistId || undefined,
      variantId: variantId || undefined,
      qty: qty ? Number(qty) : undefined,
    });
  }
}
