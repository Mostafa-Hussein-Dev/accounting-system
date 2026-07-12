import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type {
  AuthenticatedUser,
  AuthenticatedRefreshToken,
} from './interfaces/authenticated-user.interface';

// 3 requests per 15 minutes — throttled per-route (not globally) so this
// only affects the two endpoints that can trigger an email/brute-force a
// code. Defense in depth on top of AuthService's own per-account cooldown
// and per-code attempts ceiling, which hold even if a caller spreads
// requests across many IPs to dodge this.
const RESET_THROTTLE = { default: { limit: 3, ttl: 900_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({
    status: 200,
    description: 'Authenticated',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new company and its first (owner) user',
  })
  @ApiResponse({
    status: 201,
    description: 'Company and user created, authenticated',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email or tax number already in use',
  })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @ApiResponse({
    status: 200,
    description: 'New token pair issued',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token invalid, expired, or revoked',
  })
  refresh(
    @Body() _dto: RefreshTokenDto,
    @CurrentUser() token: AuthenticatedRefreshToken,
  ): Promise<AuthResponseDto> {
    return this.authService.refresh(token.userId, token.tokenId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  @ApiResponse({
    status: 401,
    description: 'Refresh token invalid, expired, or revoked',
  })
  async logout(
    @Body() _dto: RefreshTokenDto,
    @CurrentUser() token: AuthenticatedRefreshToken,
  ): Promise<void> {
    await this.authService.logout(token.tokenId);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle(RESET_THROTTLE)
  @ApiOperation({
    summary: 'Request a password reset code by email',
    description:
      'Always returns 200 with the same generic body, whether or not the ' +
      'email belongs to a registered account — this endpoint must not be ' +
      'usable to enumerate registered emails.',
  })
  @ApiResponse({ status: 200, description: 'Request accepted' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto);
  }

  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle(RESET_THROTTLE)
  @ApiOperation({
    summary: 'Check a password-reset code before showing the new-password step',
    description:
      'Validates the code but does not consume it or change anything — ' +
      'reset-password still re-validates the code itself and is what ' +
      'actually spends it.',
  })
  @ApiResponse({ status: 200, description: 'Code is valid' })
  @ApiResponse({
    status: 400,
    description: 'Code is invalid, expired, or already used',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many incorrect attempts for this code',
  })
  async verifyResetCode(@Body() dto: VerifyResetCodeDto): Promise<void> {
    await this.authService.verifyResetCode(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle(RESET_THROTTLE)
  @ApiOperation({ summary: 'Reset a password using an emailed code' })
  @ApiResponse({ status: 200, description: 'Password reset' })
  @ApiResponse({
    status: 400,
    description: 'Code is invalid, expired, or already used',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many incorrect attempts for this code',
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Current user',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.usersService.findOne(user.userId, user);
  }
}
