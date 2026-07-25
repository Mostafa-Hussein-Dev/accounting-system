import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import type { Action, AppAbility, Subjects } from './casl-ability.types';

@Injectable()
export class CaslAbilityFactory {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(user: AuthenticatedUser): Promise<AppAbility> {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    if (isPlatformAdmin(user)) {
      can('manage', 'all');
      return build();
    }

    // Permissions are scoped to the ACTIVE company: a user who is Admin in one
    // company and Member in another only gets the active company's grants. With
    // no active company selected, they get nothing.
    if (!user.companyId) {
      return build();
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: user.userId, companyId: user.companyId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.permissions) {
        can(
          rolePermission.permission.action as Action,
          rolePermission.permission.subject as Subjects,
        );
      }
    }

    return build();
  }
}
