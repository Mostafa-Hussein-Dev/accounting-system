import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service';
import {
  CreateMovementDto,
  MovementResponseDto,
  QueryMovementDto,
} from './dto/stock-movement.dto';
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
}
