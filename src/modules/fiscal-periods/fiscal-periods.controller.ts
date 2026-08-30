import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FiscalPeriodsService } from './fiscal-periods.service';
import {
  CloseYearDto,
  CloseYearResultDto,
  FiscalPeriodResponseDto,
  PeriodRefDto,
  QueryFiscalPeriodsDto,
} from './dto/fiscal-period.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Fiscal Periods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('fiscal-periods')
export class FiscalPeriodsController {
  constructor(private readonly svc: FiscalPeriodsService) {}

  @Get()
  @RequirePermissions({ action: 'read', subject: 'FiscalPeriod' })
  list(
    @Query() query: QueryFiscalPeriodsDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<FiscalPeriodResponseDto[]> {
    return this.svc.list(query, caller);
  }

  @Post('lock')
  @RequirePermissions({ action: 'lock', subject: 'FiscalPeriod' })
  lock(
    @Body() dto: PeriodRefDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<FiscalPeriodResponseDto> {
    return this.svc.lock(dto, caller);
  }

  @Post('unlock')
  @RequirePermissions({ action: 'unlock', subject: 'FiscalPeriod' })
  unlock(
    @Body() dto: PeriodRefDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<FiscalPeriodResponseDto> {
    return this.svc.unlock(dto, caller);
  }

  @Post('close-year')
  @RequirePermissions({ action: 'close', subject: 'FiscalPeriod' })
  closeYear(
    @Body() dto: CloseYearDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<CloseYearResultDto> {
    return this.svc.closeYear(dto, caller);
  }
}
