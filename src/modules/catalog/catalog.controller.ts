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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CatalogService, type LookupKind } from './catalog.service';
import {
  CreateCategoryDto,
  CreateLookupDto,
  LookupResponseDto,
  UpdateCategoryDto,
  UpdateLookupDto,
} from './dto/lookup.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

// Shared CRUD for the four simple lookups (brand/family/size/colour). Each
// concrete controller only sets its base path + kind.
abstract class SimpleLookupController {
  protected abstract kind: LookupKind;
  constructor(protected readonly svc: CatalogService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Item' })
  create(
    @Body() dto: CreateLookupDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<LookupResponseDto> {
    return this.svc.create(this.kind, dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Item' })
  findAll(
    @CurrentUser() caller: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ): Promise<LookupResponseDto[]> {
    return this.svc.findAll(this.kind, caller, companyId);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Item' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<LookupResponseDto> {
    return this.svc.findOne(this.kind, id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Item' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLookupDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<LookupResponseDto> {
    return this.svc.update(this.kind, id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Item' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.svc.remove(this.kind, id, caller);
  }
}

@ApiTags('Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('brands')
export class BrandsController extends SimpleLookupController {
  protected kind: LookupKind = 'brand';
  // Explicit constructor so Nest emits DI metadata (a subclass without its own
  // constructor gets no design:paramtypes and the service resolves to undefined).
  constructor(svc: CatalogService) {
    super(svc);
  }
}

@ApiTags('Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('families')
export class FamiliesController extends SimpleLookupController {
  protected kind: LookupKind = 'family';
  constructor(svc: CatalogService) {
    super(svc);
  }
}

@ApiTags('Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('sizes')
export class SizesController extends SimpleLookupController {
  protected kind: LookupKind = 'size';
  constructor(svc: CatalogService) {
    super(svc);
  }
}

@ApiTags('Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('colours')
export class ColoursController extends SimpleLookupController {
  protected kind: LookupKind = 'colour';
  constructor(svc: CatalogService) {
    super(svc);
  }
}

// Item categories carry a parentId, so they use the category DTOs (otherwise
// whitelist validation would strip parentId).
@ApiTags('Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('item-categories')
export class ItemCategoriesController {
  constructor(private readonly svc: CatalogService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Item' })
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<LookupResponseDto> {
    return this.svc.create('itemCategory', dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Item' })
  findAll(
    @CurrentUser() caller: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ): Promise<LookupResponseDto[]> {
    return this.svc.findAll('itemCategory', caller, companyId);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Item' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<LookupResponseDto> {
    return this.svc.findOne('itemCategory', id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'Item' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<LookupResponseDto> {
    return this.svc.update('itemCategory', id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Item' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.svc.remove('itemCategory', id, caller);
  }
}
