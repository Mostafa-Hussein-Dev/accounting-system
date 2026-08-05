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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderResponseDto,
  QueryPurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Purchasing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly svc: PurchaseOrdersService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Purchase' })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PurchaseOrderResponseDto> {
    return this.svc.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Purchase' })
  findAll(
    @Query() query: QueryPurchaseOrderDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<PurchaseOrderResponseDto>> {
    return this.svc.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Purchase' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PurchaseOrderResponseDto> {
    return this.svc.findOne(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Purchase' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PurchaseOrderResponseDto> {
    return this.svc.update(id, dto, caller);
  }

  @Post(':id/confirm')
  @RequirePermissions({ action: 'post', subject: 'Purchase' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PurchaseOrderResponseDto> {
    return this.svc.confirm(id, caller);
  }

  @Post(':id/cancel')
  @RequirePermissions({ action: 'update', subject: 'Purchase' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PurchaseOrderResponseDto> {
    return this.svc.cancel(id, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Purchase' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.svc.remove(id, caller);
  }
}
