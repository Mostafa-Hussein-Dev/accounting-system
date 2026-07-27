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
import { GlService } from './gl.service';
import { PostingService } from './posting.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { QueryJournalEntriesDto } from './dto/query-journal-entries.dto';
import { ReverseJournalEntryDto } from './dto/reverse-journal-entry.dto';
import { JournalEntryResponseDto } from './dto/journal-entry-response.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';
import { NoAudit } from '../audit/decorators/audit.decorator';

@ApiTags('Journal Entries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('journal-entries')
export class JournalEntriesController {
  constructor(
    private readonly gl: GlService,
    private readonly posting: PostingService,
  ) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'JournalEntry' })
  @ApiOperation({
    summary:
      'Create a DRAFT journal entry. Rejected unless base-currency debits equal credits; base amounts are computed server-side.',
  })
  @ApiResponse({
    status: 201,
    description: 'Draft entry created',
    type: JournalEntryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Unbalanced, control-account posting, or invalid line',
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({
    status: 404,
    description: 'Account, branch, or company not found',
  })
  create(
    @Body() dto: CreateJournalEntryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<JournalEntryResponseDto> {
    return this.gl.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'JournalEntry' })
  @ApiOperation({
    summary:
      'List journal entries, filterable by status, date range, and account.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of entries',
    type: JournalEntryResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @Query() query: QueryJournalEntriesDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<JournalEntryResponseDto>> {
    return this.gl.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'JournalEntry' })
  @ApiOperation({ summary: 'Get a journal entry (with its lines) by id' })
  @ApiResponse({
    status: 200,
    description: 'Entry found',
    type: JournalEntryResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<JournalEntryResponseDto> {
    return this.gl.findOne(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'JournalEntry' })
  @ApiOperation({
    summary:
      'Edit a DRAFT entry (blocked once posted). Supplying lines replaces them wholesale.',
  })
  @ApiResponse({
    status: 200,
    description: 'Draft updated',
    type: JournalEntryResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Unbalanced or invalid line' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiResponse({ status: 409, description: 'Entry is posted (immutable)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJournalEntryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<JournalEntryResponseDto> {
    return this.gl.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'JournalEntry' })
  @ApiOperation({
    summary: 'Delete a DRAFT entry (blocked once posted — reverse it instead)',
  })
  @ApiResponse({ status: 204, description: 'Draft deleted' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiResponse({ status: 409, description: 'Entry is posted (immutable)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.gl.remove(id, caller);
  }

  @Post(':id/post')
  @NoAudit() // PostingService.post records a richer POST event with before/after
  @RequirePermissions({ action: 'post', subject: 'JournalEntry' })
  @ApiOperation({
    summary:
      'Post a DRAFT entry: assign its number and make it part of the ledger (immutable thereafter).',
  })
  @ApiResponse({
    status: 200,
    description: 'Entry posted',
    type: JournalEntryResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Entry or sequence not found' })
  @ApiResponse({ status: 409, description: 'Entry is already posted' })
  post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<JournalEntryResponseDto> {
    return this.posting.post(id, caller);
  }

  @Post(':id/reverse')
  @NoAudit() // PostingService.reverse records a richer REVERSE event with before/after
  @RequirePermissions({ action: 'reverse', subject: 'JournalEntry' })
  @ApiOperation({
    summary:
      'Reverse a POSTED entry: create the opposite posted entry so the two net to zero.',
  })
  @ApiResponse({
    status: 201,
    description: 'Reversing entry created',
    type: JournalEntryResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  @ApiResponse({
    status: 409,
    description: 'Entry is a draft or was already reversed',
  })
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseJournalEntryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<JournalEntryResponseDto> {
    return this.posting.reverse(id, dto, caller);
  }
}
