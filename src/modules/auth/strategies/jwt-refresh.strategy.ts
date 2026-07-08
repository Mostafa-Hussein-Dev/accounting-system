import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnvConfig } from '../../../config/env.schema';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtRefreshPayload } from '../interfaces/jwt-payload.interface';
import { AuthenticatedRefreshToken } from '../interfaces/authenticated-user.interface';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    configService: ConfigService<EnvConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_REFRESH_SECRET', { infer: true }),
    });
  }

  async validate(
    payload: JwtRefreshPayload,
  ): Promise<AuthenticatedRefreshToken> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid, expired, or has been revoked.',
        field: null,
      });
    }
    return { userId: payload.sub, tokenId: payload.jti };
  }
}
