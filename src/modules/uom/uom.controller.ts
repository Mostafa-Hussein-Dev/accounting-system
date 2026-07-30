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
import { UomService } from './uom.service';
import {
  CreateUomCategoryDto,
  UpdateUomCategoryDto,
  UomCategoryResponseDto,
} from './dto/uom-category.dto';
import {
  ConvertUomDto,
  ConvertUomResponseDto,
  CreateUomDto,
  UomResponseDto,
  UpdateUomDto,
} from './dto/uom.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Units of Measure')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('uom-categories')
export class UomCategoriesController {
  constructor(private readonly uom: UomService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Uom' })
  @ApiOperation({
    summary: 'Create a UoM category (units only convert within a category).',
  })
  @ApiResponse({ status: 201, type: UomCategoryResponseDto })
  create(
    @Body() dto: CreateUomCategoryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<UomCategoryResponseDto> {
    return this.uom.createCategory(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Uom' })
  @ApiOperation({ summary: 'List UoM categories.' })
  @ApiResponse({ status: 200, type: UomCategoryResponseDto, isArray: true })
  findAll(
    @CurrentUser() caller: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ): Promise<UomCategoryResponseDto[]> {
    return this.uom.findAllCategories(caller, companyId);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Uom' })
  @ApiResponse({ status: 200, type: UomCategoryResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<UomCategoryResponseDto> {
    return this.uom.findCategory(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Uom' })
  @ApiResponse({ status: 200, type: UomCategoryResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUomCategoryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<UomCategoryResponseDto> {
    return this.uom.updateCategory(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Uom' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 409, description: 'Category has units' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.uom.removeCategory(id, caller);
  }
}

@ApiTags('Units of Measure')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('uoms')
export class UomsController {
  constructor(private readonly uom: UomService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Uom' })
  @ApiOperation({
    summary:
      'Create a unit of measure. A REFERENCE unit has factor 1 (one per category); a BIGGER/SMALLER unit needs a factor (reference units per one of it).',
  })
  @ApiResponse({ status: 201, type: UomResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Category already has a reference unit, or name in use',
  })
  create(
    @Body() dto: CreateUomDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<UomResponseDto> {
    return this.uom.createUom(dto, caller);
  }

  // Declared before :id so "convert" is never parsed as an id.
  @Get('convert')
  @RequirePermissions({ action: 'read', subject: 'Uom' })
  @ApiOperation({
    summary: 'Convert a quantity between two units of the same category.',
  })
  @ApiResponse({ status: 200, type: ConvertUomResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Units are in different categories',
  })
  convert(
    @Query() dto: ConvertUomDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<ConvertUomResponseDto> {
    return this.uom.convert(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Uom' })
  @ApiOperation({ summary: 'List units, optionally filtered by categoryId.' })
  @ApiResponse({ status: 200, type: UomResponseDto, isArray: true })
  findAll(
    @CurrentUser() caller: AuthenticatedUser,
    @Query('categoryId') categoryId?: string,
    @Query('companyId') companyId?: string,
  ): Promise<UomResponseDto[]> {
    return this.uom.findAllUoms(caller, categoryId, companyId);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Uom' })
  @ApiResponse({ status: 200, type: UomResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<UomResponseDto> {
    return this.uom.findUom(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Uom' })
  @ApiResponse({ status: 200, type: UomResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUomDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<UomResponseDto> {
    return this.uom.updateUom(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Uom' })
  @ApiResponse({ status: 204 })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.uom.removeUom(id, caller);
  }
}
