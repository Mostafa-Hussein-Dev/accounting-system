import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LedgerService } from './ledger.service';
import { QueryTrialBalanceDto } from './dto/query-trial-balance.dto';
import { TrialBalanceResponseDto } from './dto/trial-balance-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('trial-balance')
  @RequirePermissions({ action: 'read', subject: 'JournalEntry' })
  @ApiOperation({
    summary:
      'Trial balance (FR-905): every account’s net balance in debit/credit columns; totals must be equal.',
  })
  @ApiResponse({
    status: 200,
    description: 'The trial balance',
    type: TrialBalanceResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  trialBalance(
    @Query() query: QueryTrialBalanceDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<TrialBalanceResponseDto> {
    return this.ledger.trialBalance(
      caller,
      query.asOf,
      query.branchId,
      query.companyId,
      query.numberPrefix,
      query.rollUp,
    );
  }
}
