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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { VariantsService } from './variants.service';
import {
  CreateVariantDto,
  GenerateResultDto,
  GenerateVariantsDto,
  UpdateVariantDto,
  VariantResponseDto,
} from './dto/variant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('items/:itemId/variants')
export class VariantsController {
  constructor(private readonly variants: VariantsService) {}

  @Post()
  @RequirePermissions({ action: 'update', subject: 'Item' })
  @ApiOperation({ summary: 'Add a single size/colour variant to an item.' })
  @ApiResponse({ status: 201, type: VariantResponseDto })
  @ApiResponse({ status: 400, description: 'No size/colour given' })
  @ApiResponse({
    status: 409,
    description: 'Combination or SKU already exists',
  })
  create(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: CreateVariantDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<VariantResponseDto> {
    return this.variants.create(itemId, dto, caller);
  }

  @Post('generate')
  @RequirePermissions({ action: 'update', subject: 'Item' })
  @ApiOperation({
    summary:
      'Generate the size×colour matrix for an item from the given sizeIds/colourIds, skipping combinations that already exist.',
  })
  @ApiResponse({ status: 201, type: GenerateResultDto })
  @ApiResponse({ status: 400, description: 'Empty matrix' })
  generate(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: GenerateVariantsDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<GenerateResultDto> {
    return this.variants.generate(itemId, dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Item' })
  @ApiOperation({ summary: "List an item's variants." })
  @ApiResponse({ status: 200, type: VariantResponseDto, isArray: true })
  findAll(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<VariantResponseDto[]> {
    return this.variants.findAll(itemId, caller);
  }

  @Patch(':variantId')
  @RequirePermissions({ action: 'update', subject: 'Item' })
  @ApiResponse({ status: 200, type: VariantResponseDto })
  update(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<VariantResponseDto> {
    return this.variants.update(itemId, variantId, dto, caller);
  }

  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'update', subject: 'Item' })
  @ApiResponse({ status: 204 })
  remove(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.variants.remove(itemId, variantId, caller);
  }
}
