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
import { GoodsReceiptsService } from './goods-receipts.service';
import {
  CreateGoodsReceiptDto,
  GoodsReceiptResponseDto,
  QueryGoodsReceiptDto,
} from './dto/goods-receipt.dto';
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
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly svc: GoodsReceiptsService) {}

  @Post()
  @RequirePermissions({ action: 'post', subject: 'Purchase' })
  receive(
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<GoodsReceiptResponseDto> {
    return this.svc.receive(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Purchase' })
  findAll(
    @Query() query: QueryGoodsReceiptDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<GoodsReceiptResponseDto>> {
    return this.svc.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Purchase' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<GoodsReceiptResponseDto> {
    return this.svc.findOne(id, caller);
  }
}
