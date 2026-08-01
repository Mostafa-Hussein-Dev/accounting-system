import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service';
import {
  CreateMovementDto,
  MovementResponseDto,
  QueryMovementDto,
} from './dto/stock-movement.dto';
import {
  ItemStockResponseDto,
  OnHandQueryDto,
  OnHandResponseDto,
  ValuationQueryDto,
  ValuationResponseDto,
} from './dto/stock-read.dto';
import { AdjustStockDto, TransferStockDto } from './dto/stock-ops.dto';
import { BulkOnHandQueryDto, OnHandRowDto } from './dto/bulk-on-hand.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly svc: StockService) {}

  @Post('movements')
  @RequirePermissions({ action: 'create', subject: 'Stock' })
  createMovement(
    @Body() dto: CreateMovementDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<MovementResponseDto> {
    return this.svc.createMovement(dto, caller);
  }

  @Get('movements')
  @RequirePermissions({ action: 'read', subject: 'Stock' })
  listMovements(
    @Query() query: QueryMovementDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<MovementResponseDto>> {
    return this.svc.listMovements(query, caller);
  }

  @Post('adjustments')
  @RequirePermissions({ action: 'update', subject: 'Stock' })
  adjust(
    @Body() dto: AdjustStockDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<MovementResponseDto> {
    return this.svc.adjust(dto, caller);
  }

  @Post('transfers')
  @RequirePermissions({ action: 'create', subject: 'Stock' })
  transfer(
    @Body() dto: TransferStockDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<MovementResponseDto> {
    return this.svc.transfer(dto, caller);
  }

  @Get('on-hand')
  @RequirePermissions({ action: 'read', subject: 'Stock' })
  onHand(
    @Query() query: OnHandQueryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<OnHandResponseDto> {
    return this.svc.onHand(query, caller);
  }

  // Bulk on-hand for many items, with filtering + optional per-location
  // breakdown. Static subpath, declared distinctly from 'on-hand'.
  @Get('on-hand/bulk')
  @RequirePermissions({ action: 'read', subject: 'Stock' })
  bulkOnHand(
    @Query() query: BulkOnHandQueryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<OnHandRowDto>> {
    return this.svc.bulkOnHand(query, caller);
  }

  @Get('valuation')
  @RequirePermissions({ action: 'read', subject: 'Stock' })
  valuation(
    @Query() query: ValuationQueryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ValuationResponseDto> {
    return this.svc.valuation(query, caller);
  }
}

// On-hand for one item, nested under the item resource for convenience.
@ApiTags('Stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('items/:itemId')
export class ItemStockController {
  constructor(private readonly svc: StockService) {}

  @Get('stock')
  @RequirePermissions({ action: 'read', subject: 'Stock' })
  itemStock(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() caller: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ): Promise<ItemStockResponseDto> {
    return this.svc.itemStock(itemId, caller, companyId);
  }
}
