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
import { SequencesService } from './sequences.service';
import { CreateDocumentSequenceDto } from './dto/create-document-sequence.dto';
import { UpdateDocumentSequenceDto } from './dto/update-document-sequence.dto';
import { QueryDocumentSequenceDto } from './dto/query-document-sequence.dto';
import { DocumentSequenceResponseDto } from './dto/document-sequence-response.dto';
import { PreviewNumberDto } from './dto/preview-number.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Sequences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sequences')
export class SequencesController {
  constructor(private readonly sequencesService: SequencesService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'DocumentSequence' })
  @ApiOperation({
    summary:
      'Define a document-numbering series. Company-scoped caller: forced into their own company. Platform admin: target a company via body companyId.',
  })
  @ApiResponse({
    status: 201,
    description: 'Sequence created',
    type: DocumentSequenceResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Branch or company not found' })
  @ApiResponse({
    status: 409,
    description: 'A sequence for this type already exists in this scope',
  })
  create(
    @Body() dto: CreateDocumentSequenceDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<DocumentSequenceResponseDto> {
    return this.sequencesService.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'DocumentSequence' })
  @ApiOperation({
    summary: 'List document sequences, filterable by document type and branch.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of sequences',
    type: DocumentSequenceResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @Query() query: QueryDocumentSequenceDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<DocumentSequenceResponseDto>> {
    return this.sequencesService.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'DocumentSequence' })
  @ApiOperation({ summary: 'Get a document sequence by id' })
  @ApiResponse({
    status: 200,
    description: 'Sequence found',
    type: DocumentSequenceResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Sequence not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<DocumentSequenceResponseDto> {
    return this.sequencesService.findOne(id, caller);
  }

  @Get(':id/preview')
  @RequirePermissions({ action: 'read', subject: 'DocumentSequence' })
  @ApiOperation({
    summary:
      'Preview the next document number for this series WITHOUT consuming it (does not advance the counter).',
  })
  @ApiResponse({
    status: 200,
    description: 'The next number that would be produced',
    type: PreviewNumberDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Sequence not found' })
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<PreviewNumberDto> {
    return this.sequencesService.preview(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'DocumentSequence' })
  @ApiOperation({
    summary:
      'Update a sequence (prefix/suffix/reset/next number, or deactivate)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sequence updated',
    type: DocumentSequenceResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Sequence or branch not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentSequenceDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<DocumentSequenceResponseDto> {
    return this.sequencesService.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'DocumentSequence' })
  @ApiOperation({ summary: 'Hard delete a sequence (configuration data)' })
  @ApiResponse({ status: 204, description: 'Sequence deleted' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Sequence not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.sequencesService.remove(id, caller);
  }
}
