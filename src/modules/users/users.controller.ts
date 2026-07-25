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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipGuard } from '../auth/guards/company-membership.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PermissionsGuard } from '../casl/guards/permissions.guard';
import { RequirePermissions } from '../casl/decorators/require-permissions.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CompanyMembershipGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions({ action: 'create', subject: 'User' })
  @ApiOperation({
    summary:
      'Create a new user (platform admin: any company via body companyId or none; company-scoped caller: forced into their own company)',
  })
  @ApiResponse({
    status: 201,
    description: 'User created',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return this.usersService.create(dto, caller);
  }

  @Get()
  @RequirePermissions({ action: 'read', subject: 'User' })
  @ApiOperation({
    summary:
      'List users (platform admin: everyone; company-scoped caller: their own company only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of users',
    type: UserResponseDto,
    isArray: true,
  })
  findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<Paginated<UserResponseDto>> {
    return this.usersService.findAll(query, caller);
  }

  @Get(':id')
  @RequirePermissions({ action: 'read', subject: 'User' })
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return this.usersService.findOne(id, caller);
  }

  @Patch(':id')
  @RequirePermissions({ action: 'update', subject: 'User' })
  @ApiOperation({ summary: 'Update a user' })
  @ApiResponse({
    status: 200,
    description: 'User updated',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto, caller);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: 'delete', subject: 'User' })
  @ApiOperation({ summary: 'Soft delete a user' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    return this.usersService.remove(id, caller);
  }
}
