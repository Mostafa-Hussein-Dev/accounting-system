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
import { PaymentsService } from './payments.service';
import {
  CreatePaymentDto,
  OpenItemResponseDto,
  OpenItemsQueryDto,
  PaymentResponseDto,
  QueryPaymentDto,
} from './dto/payment.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Payment' })
  create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    return this.svc.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Payment' })
  findAll(
    @Query() query: QueryPaymentDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<PaymentResponseDto>> {
    return this.svc.findAll(query, caller);
  }

  @Get('open-items')
  @RequirePermissions({ action: 'read', subject: 'Payment' })
  openItems(
    @Query() query: OpenItemsQueryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<OpenItemResponseDto[]> {
    return this.svc.openItems(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Payment' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    return this.svc.findOne(id, caller);
  }

  @Post(':id/void')
  @RequirePermissions({ action: 'void', subject: 'Payment' })
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PaymentResponseDto> {
    return this.svc.void(id, caller);
  }
}
