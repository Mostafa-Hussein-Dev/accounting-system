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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { VendorBillsService } from './vendor-bills.service';
import {
  CreateVendorBillDto,
  QueryVendorBillDto,
  VendorBillResponseDto,
} from './dto/vendor-bill.dto';
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
@Controller('vendor-bills')
export class VendorBillsController {
  constructor(private readonly svc: VendorBillsService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Purchase' })
  create(
    @Body() dto: CreateVendorBillDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<VendorBillResponseDto> {
    return this.svc.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Purchase' })
  findAll(
    @Query() query: QueryVendorBillDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<VendorBillResponseDto>> {
    return this.svc.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Purchase' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<VendorBillResponseDto> {
    return this.svc.findOne(id, caller);
  }

  @Post(':id/confirm')
  @RequirePermissions({ action: 'post', subject: 'Purchase' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<VendorBillResponseDto> {
    return this.svc.confirm(id, caller);
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
