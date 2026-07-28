import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PartnersService } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { QueryPartnersDto } from './dto/query-partners.dto';
import { PartnerResponseDto } from './dto/partner-response.dto';
import { PartnerBalanceResponseDto } from './dto/partner-balance-response.dto';
import { PartnerTransactionRowDto } from './dto/partner-transaction-response.dto';
import { QueryStatementDto } from './dto/query-statement.dto';
import { PartnerStatementResponseDto } from './dto/partner-statement-response.dto';
import { StatementExportService } from './statement-export.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Partners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('partners')
export class PartnersController {
  constructor(
    private readonly partnersService: PartnersService,
    private readonly statementExport: StatementExportService,
  ) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Partner' })
  @ApiOperation({
    summary:
      'Create a customer/supplier (Odoo res.partner). At least one of isCustomer/isSupplier is required. receivable/payable accounts default to the company AR (41) / AP (40) control accounts; ref auto-generates as <control-account-number><counter> (e.g. 410001) when omitted.',
  })
  @ApiResponse({
    status: 201,
    description: 'Partner created',
    type: PartnerResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'No role selected, or no AR/AP control account in the chart',
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({
    status: 404,
    description: 'Account, currency, or company not found',
  })
  @ApiResponse({
    status: 409,
    description: 'ref already exists in this company',
  })
  create(
    @Body() dto: CreatePartnerDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PartnerResponseDto> {
    return this.partnersService.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Partner' })
  @ApiOperation({
    summary:
      'List partners, filterable by isCustomer, isSupplier, isActive, and a ref/name/tin search (q).',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of partners',
    type: PartnerResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @Query() query: QueryPartnersDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<PartnerResponseDto>> {
    return this.partnersService.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Partner' })
  @ApiOperation({ summary: 'Get a partner (with its addresses) by id' })
  @ApiResponse({
    status: 200,
    description: 'Partner found',
    type: PartnerResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PartnerResponseDto> {
    return this.partnersService.findOne(id, caller);
  }

  @Get(':id/balance')
  @RequirePermissions({ action: 'read', subject: 'Partner' })
  @ApiOperation({
    summary:
      "The partner's balance, derived from posted journal lines carrying its partnerId (subsidiary ledger). Base (USD) net plus a per-currency breakdown. Optional asOf date.",
  })
  @ApiResponse({
    status: 200,
    description: 'Derived partner balance',
    type: PartnerBalanceResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  balance(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
    @Query('asOf') asOf?: string,
  ): Promise<PartnerBalanceResponseDto> {
    return this.partnersService.balance(id, caller, asOf);
  }

  @Get(':id/transactions')
  @RequirePermissions({ action: 'read', subject: 'Partner' })
  @ApiOperation({
    summary:
      "The partner's posted ledger lines (statement foundation — FR-303). Paginated, newest first. Running-balance/export deferred.",
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated partner transactions',
    type: PartnerTransactionRowDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  transactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<PartnerTransactionRowDto>> {
    return this.partnersService.transactions(id, caller, query);
  }

  @Get(':id/statement')
  @RequirePermissions({ action: 'read', subject: 'Partner' })
  @ApiOperation({
    summary:
      'The partner statement (relevé, FR-303) over [from, to]: opening balance, each posted transaction with a role-oriented running balance, and a closing balance — in base USD and converted to LBP at the rate in force on `to`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Partner statement',
    type: PartnerStatementResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid date range' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  statement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryStatementDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PartnerStatementResponseDto> {
    return this.partnersService.statement(id, caller, query);
  }

  @Get(':id/statement/export')
  @RequirePermissions({ action: 'read', subject: 'Partner' })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Download the partner statement as a PDF or Excel file. Same data as GET /statement; ?format=pdf (default) or excel.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statement file (application/pdf or spreadsheet)',
  })
  @ApiResponse({ status: 400, description: 'Invalid format or date range' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  async exportStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryStatementDto,
    @Query('format') format = 'pdf',
    @CurrentUser() caller: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    if (format !== 'pdf' && format !== 'excel') {
      throw new BadRequestException({
        code: 'INVALID_EXPORT_FORMAT',
        message: "format must be 'pdf' or 'excel'.",
        field: 'format',
      });
    }
    const statement = await this.partnersService.statement(id, caller, query);
    const base = `statement-${statement.ref}-${statement.from}-${statement.to}`;
    if (format === 'excel') {
      const buffer = await this.statementExport.toExcel(statement);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${base}.xlsx"`,
      );
      res.end(buffer);
      return;
    }
    const buffer = await this.statementExport.toPdf(statement);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
    res.end(buffer);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Partner' })
  @ApiOperation({
    summary:
      'Update a partner (also used to deactivate via isActive). Supplying `addresses` replaces the whole set.',
  })
  @ApiResponse({
    status: 200,
    description: 'Partner updated',
    type: PartnerResponseDto,
  })
  @ApiResponse({ status: 400, description: 'No role selected' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({
    status: 404,
    description: 'Partner, account, or currency not found',
  })
  @ApiResponse({
    status: 409,
    description: 'ref already exists in this company',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PartnerResponseDto> {
    return this.partnersService.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Partner' })
  @ApiOperation({ summary: 'Soft delete a partner' })
  @ApiResponse({ status: 204, description: 'Partner deleted' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Partner not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.partnersService.remove(id, caller);
  }
}
