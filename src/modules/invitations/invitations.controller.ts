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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { AcceptInvitationResultDto } from './dto/accept-invitation-result.dto';
import { InvitationDurationOptionDto } from './dto/invitation-duration-option.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  // Public — the token in the body is the credential; no auth (the invitee may
  // not have an account yet). Declared first so 'accept' is never shadowed.
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Accept an invitation using its token. Creates the user (if new) and grants company membership + roles.',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation accepted; membership granted',
    type: AcceptInvitationResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiResponse({ status: 409, description: 'Invitation already accepted' })
  accept(@Body() dto: AcceptInvitationDto): Promise<AcceptInvitationResultDto> {
    return this.invitationsService.accept(dto.token);
  }

  @Get('durations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'The selectable invitation durations (value + label + days) — for the frontend to build the duration dropdown.',
  })
  @ApiResponse({
    status: 200,
    description: 'Duration options',
    type: InvitationDurationOptionDto,
    isArray: true,
  })
  durations(): InvitationDurationOptionDto[] {
    return this.invitationsService.durations();
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
  @RequirePermissions({ action: 'create', subject: 'User' })
  @ApiOperation({
    summary:
      'Invite someone to join a company (reuses user.create — Company Admin). The target company comes from the JWT active company for a company-scoped caller (body companyId is ignored for them); a platform admin sets it via body companyId. Emails an accept link; a new email also gets temporary login credentials. No user is created until the invite is accepted.',
  })
  @ApiResponse({
    status: 201,
    description: 'Invitation created and emailed',
    type: InvitationResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Company or role not found' })
  @ApiResponse({
    status: 409,
    description: 'Already a member, or a pending invitation exists',
  })
  create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<InvitationResponseDto> {
    return this.invitationsService.create(dto, caller);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
  @RequirePermissions({ action: 'read', subject: 'User' })
  @ApiOperation({ summary: 'List the active company’s invitations' })
  @ApiResponse({
    status: 200,
    description: 'Invitations',
    type: InvitationResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  findAll(
    @CurrentUser() caller: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ): Promise<InvitationResponseDto[]> {
    return this.invitationsService.findAll(caller, companyId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
  @RequirePermissions({ action: 'delete', subject: 'User' })
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiResponse({ status: 204, description: 'Invitation revoked' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.invitationsService.revoke(id, caller);
  }
}
