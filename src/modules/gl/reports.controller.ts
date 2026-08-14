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
import { QueryVatReturnDto } from './dto/query-vat-return.dto';
import { VatReturnResponseDto } from './dto/vat-return-response.dto';
import { QueryGeneralLedgerDto } from './dto/query-general-ledger.dto';
import { GeneralLedgerResponseDto } from './dto/general-ledger-response.dto';
import { QueryIncomeStatementDto } from './dto/query-income-statement.dto';
import { IncomeStatementResponseDto } from './dto/income-statement-response.dto';
import { QueryBalanceSheetDto } from './dto/query-balance-sheet.dto';
import { BalanceSheetResponseDto } from './dto/balance-sheet-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
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
      query.presentIn,
      query.rateType,
    );
  }

  @Get('vat-return')
  @RequirePermissions({ action: 'read', subject: 'JournalEntry' })
  @ApiOperation({
    summary:
      'VAT return (FR-903): output VAT − input VAT for a period = net VAT payable/recoverable.',
  })
  @ApiResponse({
    status: 200,
    description: 'The VAT return for the period',
    type: VatReturnResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  vatReturn(
    @Query() query: QueryVatReturnDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<VatReturnResponseDto> {
    return this.ledger.vatReturn(
      caller,
      query.from,
      query.to,
      query.branchId,
      query.companyId,
      query.presentIn,
      query.rateType,
    );
  }

  @Get('general-ledger')
  @RequirePermissions({ action: 'read', subject: 'JournalEntry' })
  @ApiOperation({
    summary:
      'General ledger (FR-905): one account’s posted lines over a period with a running balance.',
  })
  @ApiResponse({ status: 200, type: GeneralLedgerResponseDto })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  generalLedger(
    @Query() query: QueryGeneralLedgerDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<GeneralLedgerResponseDto> {
    return this.ledger.generalLedger(
      caller,
      query.accountId,
      query.from,
      query.to,
      query.branchId,
      query.companyId,
      query.presentIn,
      query.rateType,
    );
  }

  @Get('income-statement')
  @RequirePermissions({ action: 'read', subject: 'JournalEntry' })
  @ApiOperation({
    summary:
      'Income statement / P&L (FR-905): revenue − expenses over a period = net result.',
  })
  @ApiResponse({ status: 200, type: IncomeStatementResponseDto })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  incomeStatement(
    @Query() query: QueryIncomeStatementDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<IncomeStatementResponseDto> {
    return this.ledger.incomeStatement(
      caller,
      query.from,
      query.to,
      query.rollUp,
      query.branchId,
      query.companyId,
      query.presentIn,
      query.rateType,
    );
  }

  @Get('balance-sheet')
  @RequirePermissions({ action: 'read', subject: 'JournalEntry' })
  @ApiOperation({
    summary:
      'Balance sheet (FR-905): assets vs liabilities + equity as of a date; the period result is folded into equity.',
  })
  @ApiResponse({ status: 200, type: BalanceSheetResponseDto })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  balanceSheet(
    @Query() query: QueryBalanceSheetDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<BalanceSheetResponseDto> {
    return this.ledger.balanceSheet(
      caller,
      query.asOf,
      query.rollUp,
      query.branchId,
      query.companyId,
      query.presentIn,
      query.rateType,
    );
  }
}
