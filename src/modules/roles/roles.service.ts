import { Injectable } from '@nestjs/common';
import { RoleScope } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { RoleResponseDto } from './dto/role-response.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(caller: AuthenticatedUser): Promise<RoleResponseDto[]> {
    const roles = await this.prisma.role.findMany({
      where: isPlatformAdmin(caller) ? {} : { scope: RoleScope.COMPANY },
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map(RoleResponseDto.fromEntity);
  }
}
