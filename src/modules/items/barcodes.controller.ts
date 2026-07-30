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
import { BarcodesService } from './barcodes.service';
import {
  BarcodeResponseDto,
  CreateBarcodeDto,
  UpdateBarcodeDto,
} from './dto/barcode.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('items/:itemId/barcodes')
export class BarcodesController {
  constructor(private readonly barcodes: BarcodesService) {}

  @Post()
  @RequirePermissions({ action: 'update', subject: 'Item' })
  @ApiOperation({ summary: 'Add a barcode to an item or one of its variants.' })
  @ApiResponse({ status: 201, type: BarcodeResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Barcode already used in this company',
  })
  create(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: CreateBarcodeDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<BarcodeResponseDto> {
    return this.barcodes.create(itemId, dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Item' })
  @ApiOperation({ summary: "List an item's barcodes (primary first)." })
  @ApiResponse({ status: 200, type: BarcodeResponseDto, isArray: true })
  findAll(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<BarcodeResponseDto[]> {
    return this.barcodes.findAll(itemId, caller);
  }

  @Patch(':barcodeId')
  @RequirePermissions({ action: 'update', subject: 'Item' })
  @ApiResponse({ status: 200, type: BarcodeResponseDto })
  update(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('barcodeId', ParseUUIDPipe) barcodeId: string,
    @Body() dto: UpdateBarcodeDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<BarcodeResponseDto> {
    return this.barcodes.update(itemId, barcodeId, dto, caller);
  }

  @Delete(':barcodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'update', subject: 'Item' })
  @ApiResponse({ status: 204 })
  remove(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('barcodeId', ParseUUIDPipe) barcodeId: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.barcodes.remove(itemId, barcodeId, caller);
  }
}

@ApiTags('Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('barcodes')
export class BarcodeLookupController {
  constructor(private readonly barcodes: BarcodesService) {}

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Item' })
  @ApiOperation({
    summary:
      'Resolve a scanned barcode to its item/variant (POS/scanner lookup).',
  })
  @ApiResponse({ status: 200, type: BarcodeResponseDto })
  @ApiResponse({ status: 404, description: 'Barcode not found' })
  lookup(
    @Query('barcode') barcode: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<BarcodeResponseDto> {
    return this.barcodes.lookup(barcode, caller);
  }
}
