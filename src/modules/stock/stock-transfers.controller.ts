import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StockTransfersService } from './stock-transfers.service';
import {
  CreateStockTransferDto,
  QueryStockTransferDto,
  StockTransferResponseDto,
} from './dto/stock-transfer.dto';
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
@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly svc: StockTransfersService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Stock' })
  @ApiOperation({ summary: 'Create a DRAFT inter-branch stock transfer.' })
  create(
    @Body() dto: CreateStockTransferDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<StockTransferResponseDto> {
    return this.svc.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Stock' })
  findAll(
    @Query() query: QueryStockTransferDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<StockTransferResponseDto>> {
    return this.svc.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Stock' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<StockTransferResponseDto> {
    return this.svc.findOne(id, caller);
  }

  @Post(':id/approve')
  @RequirePermissions({ action: 'approve', subject: 'Stock' })
  @ApiOperation({ summary: 'Optional approval step (DRAFT → APPROVED).' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<StockTransferResponseDto> {
    return this.svc.approve(id, caller);
  }

  @Post(':id/post')
  @RequirePermissions({ action: 'post', subject: 'Stock' })
  @ApiOperation({
    summary: 'Post the transfer: move each line to the destination location.',
  })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<StockTransferResponseDto> {
    return this.svc.post(id, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Stock' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.svc.remove(id, caller);
  }
}
