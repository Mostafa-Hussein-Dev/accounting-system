import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CompaniesService } from '../companies/companies.service';
import { EnvConfig } from '../../config/env.schema';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import {
  JwtPayload,
  JwtRefreshPayload,
} from './interfaces/jwt-payload.interface';

const TOKEN_TYPE = 'Bearer';
const MS_PER_SECOND = 1000;
const INVALID_CREDENTIALS_ERROR = {
  code: 'AUTH_INVALID_CREDENTIALS',
  message: 'Email or password is incorrect.',
  field: null,
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly companiesService: CompaniesService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.prisma.$transaction(async (tx) => {
      const company = await this.companiesService.create(dto.company, tx);
      return this.usersService.create(
        { ...dto.user, companyId: company.id },
        undefined,
        tx,
      );
    });

    await this.usersService.touchLastLogin(user.id);
    return this.issueTokenPair(user.id, user.companyId);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findAuthUserByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_ERROR);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_ERROR);
    }

    await this.usersService.touchLastLogin(user.id);
    return this.issueTokenPair(user.id, user.companyId);
  }

  async refresh(userId: string, tokenId: string): Promise<AuthResponseDto> {
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    const user = await this.usersService.findOne(userId);
    if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'AUTH_USER_INACTIVE',
        message: 'This account has been deactivated.',
        field: null,
      });
    }

    return this.issueTokenPair(user.id, user.companyId);
  }

  async logout(tokenId: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(
    userId: string,
    companyId: string | null,
  ): Promise<AuthResponseDto> {
    const accessPayload: JwtPayload = { sub: userId, companyId };
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.get('JWT_ACCESS_SECRET', { infer: true }),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES', {
        infer: true,
      }),
    });

    const tokenId = randomUUID();
    const refreshPayload: JwtRefreshPayload = {
      sub: userId,
      companyId,
      jti: tokenId,
    };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES', {
        infer: true,
      }),
    });

    const { exp: accessExp, iat: accessIat } = this.jwtService.decode<{
      exp: number;
      iat: number;
    }>(accessToken);
    const { exp: refreshExp } = this.jwtService.decode<{ exp: number }>(
      refreshToken,
    );

    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        expiresAt: new Date(refreshExp * MS_PER_SECOND),
      },
    });

    const dto = new AuthResponseDto();
    dto.accessToken = accessToken;
    dto.refreshToken = refreshToken;
    dto.tokenType = TOKEN_TYPE;
    dto.expiresIn = accessExp - accessIat;
    return dto;
  }
}
