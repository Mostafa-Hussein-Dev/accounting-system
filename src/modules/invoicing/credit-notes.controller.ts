import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreditNotesService } from './credit-notes.service';
import {
  CreateCreditNoteDto,
  CreditNoteResponseDto,
  QueryCreditNoteDto,
} from './dto/credit-note.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Invoicing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('credit-notes')
export class CreditNotesController {
  constructor(private readonly svc: CreditNotesService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'Sales' })
  create(
    @Body() dto: CreateCreditNoteDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<CreditNoteResponseDto> {
    return this.svc.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'Sales' })
  findAll(
    @Query() query: QueryCreditNoteDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<CreditNoteResponseDto>> {
    return this.svc.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'Sales' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<CreditNoteResponseDto> {
    return this.svc.findOne(id, caller);
  }

  @Post(':id/confirm')
  @RequirePermissions({ action: 'post', subject: 'Sales' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<CreditNoteResponseDto> {
    return this.svc.confirm(id, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'Sales' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.svc.remove(id, caller);
  }
}
