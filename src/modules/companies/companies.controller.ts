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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyResponseDto } from './dto/company-response.dto';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';
import { CompanySettingsResponseDto } from './dto/company-settings-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CompanySelfOrAdminGuard } from './guards/company-self-or-admin.guard';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a new company. Requires the caller to hold company.create through any of their roles (i.e. be a Company Admin of at least one company) — a Member-only user gets 403; no active-company selection is needed. The caller becomes the owner (member + Company Admin) of the new company; a platform admin may instead attach it to a user via ownerUserId. Chart/VAT/sequences are auto-seeded. (Brand-new-user signup uses POST /auth/register.)',
  })
  @ApiResponse({
    status: 201,
    description: 'Company created and provisioned',
    type: CompanyResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Caller does not have permission to create a company',
  })
  @ApiResponse({ status: 404, description: 'ownerUserId not found' })
  @ApiResponse({ status: 409, description: 'Tax number already in use' })
  create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<CompanyResponseDto> {
    return this.companiesService.create(dto, caller);
  }

  @Get()
  @ApiOperation({
    summary:
      'List companies. A platform admin sees all; a company user sees only the companies they belong to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of companies',
    type: CompanyResponseDto,
    isArray: true,
  })
  findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<CompanyResponseDto>> {
    return this.companiesService.findAll(query, caller);
  }

  @Get(':id')
  @UseGuards(CompanySelfOrAdminGuard)
  @ApiOperation({
    summary: "Get a company by id (platform admin, or that company's own user)",
  })
  @ApiResponse({
    status: 200,
    description: 'Company found',
    type: CompanyResponseDto,
  })
  @ApiResponse({ status: 403, description: 'No access to this company' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CompanyResponseDto> {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(CompanySelfOrAdminGuard, PermissionsGuard)
  @RequirePermissions({ action: 'update', subject: 'Company' })
  @ApiOperation({
    summary:
      'Update a company (platform admin, or a Company Admin of that company)',
  })
  @ApiResponse({
    status: 200,
    description: 'Company updated',
    type: CompanyResponseDto,
  })
  @ApiResponse({ status: 403, description: 'No access, or permission denied' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ): Promise<CompanyResponseDto> {
    return this.companiesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(CompanySelfOrAdminGuard, PermissionsGuard)
  @RequirePermissions({ action: 'delete', subject: 'Company' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Soft delete a company (platform admin, or a Company Admin of that company)',
  })
  @ApiResponse({ status: 204, description: 'Company deleted' })
  @ApiResponse({ status: 403, description: 'No access, or permission denied' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.companiesService.remove(id);
  }

  @Get(':id/settings')
  @UseGuards(CompanySelfOrAdminGuard)
  @ApiOperation({
    summary:
      "Get a company's settings (FR-108): base currency, fiscal-year start, rounding, templates, enabled modules, and feature flags.",
  })
  @ApiResponse({
    status: 200,
    description: 'Resolved company settings',
    type: CompanySettingsResponseDto,
  })
  @ApiResponse({ status: 403, description: 'No access to this company' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  getSettings(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompanySettingsResponseDto> {
    return this.companiesService.getSettings(id);
  }

  @Patch(':id/settings')
  @UseGuards(CompanySelfOrAdminGuard, PermissionsGuard)
  @RequirePermissions({ action: 'update', subject: 'Company' })
  @ApiOperation({
    summary:
      "Update a company's settings/feature flags (platform admin, or a Company Admin of that company). Provided keys are merged; feature flags are toggled without resending the whole set.",
  })
  @ApiResponse({
    status: 200,
    description: 'Updated company settings',
    type: CompanySettingsResponseDto,
  })
  @ApiResponse({ status: 403, description: 'No access, or permission denied' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  updateSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanySettingsDto,
  ): Promise<CompanySettingsResponseDto> {
    return this.companiesService.updateSettings(id, dto);
  }
}
