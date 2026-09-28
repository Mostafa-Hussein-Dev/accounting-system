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
import { StockCountsService } from './stock-counts.service';
import {
  CreateStockCountDto,
  QueryStockCountDto,
  StockCountResponseDto,
} from './dto/stock-count.dto';
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
@Controller('stock-counts')
export class StockCountsController {
  constructor(private readonly svc: StockCountsService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Stock' })
  @ApiOperation({
    summary: 'Create a DRAFT stock count (snapshots on-hand per line).',
  })
  create(
    @Body() dto: CreateStockCountDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<StockCountResponseDto> {
    return this.svc.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Stock' })
  findAll(
    @Query() query: QueryStockCountDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<StockCountResponseDto>> {
    return this.svc.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Stock' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<StockCountResponseDto> {
    return this.svc.findOne(id, caller);
  }

  @Post(':id/post')
  @RequirePermissions({ action: 'post', subject: 'Stock' })
  @ApiOperation({
    summary:
      'Post the count: adjustment movements per variance + one variance journal.',
  })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<StockCountResponseDto> {
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
