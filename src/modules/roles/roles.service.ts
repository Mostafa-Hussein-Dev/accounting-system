import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleResponseDto } from './dto/role-response.dto';

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const PRISMA_FOREIGN_KEY_CONSTRAINT = 'P2003';

const ROLE_INCLUDE = {
  permissions: { include: { permission: true } },
} satisfies Prisma.RoleInclude;

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(caller: AuthenticatedUser): Promise<RoleResponseDto[]> {
    const roles = await this.prisma.role.findMany({
      where: isPlatformAdmin(caller)
        ? {}
        : { OR: [{ companyId: null }, { companyId: caller.companyId }] },
      include: ROLE_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return roles.map(RoleResponseDto.fromEntity);
  }

  async create(
    dto: CreateRoleDto,
    caller: AuthenticatedUser,
  ): Promise<RoleResponseDto> {
    const companyId = isPlatformAdmin(caller)
      ? (dto.companyId ?? null)
      : (caller.companyId as string);

    if (companyId === null) {
      const globalNameTaken = await this.prisma.role.findFirst({
        where: { companyId: null, name: dto.name },
      });
      if (globalNameTaken) {
        throw new ConflictException({
          code: 'ROLE_NAME_ALREADY_EXISTS',
          message: `A global role named "${dto.name}" already exists.`,
          field: 'name',
        });
      }
    }

    await this.assertPermissionsExist(dto.permissionIds);

    try {
      const role = await this.prisma.role.create({
        data: {
          name: dto.name,
          description: dto.description,
          companyId,
          permissions: {
            create: dto.permissionIds.map((permissionId) => ({
              permissionId,
            })),
          },
        },
        include: ROLE_INCLUDE,
      });
      return RoleResponseDto.fromEntity(role);
    } catch (error) {
      throw this.mapWriteError(error, dto.name);
    }
  }

  async update(
    id: string,
    dto: UpdateRoleDto,
    caller: AuthenticatedUser,
  ): Promise<RoleResponseDto> {
    await this.assertMutable(id, caller);

    if (dto.permissionIds) {
      await this.assertPermissionsExist(dto.permissionIds);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { id },
          data: { name: dto.name, description: dto.description },
        });
        if (dto.permissionIds) {
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          await tx.rolePermission.createMany({
            data: dto.permissionIds.map((permissionId) => ({
              roleId: id,
              permissionId,
            })),
            skipDuplicates: true,
          });
        }
      });
    } catch (error) {
      throw this.mapWriteError(error, dto.name);
    }

    const role = await this.prisma.role.findUniqueOrThrow({
      where: { id },
      include: ROLE_INCLUDE,
    });
    return RoleResponseDto.fromEntity(role);
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.assertMutable(id, caller);

    const assignmentCount = await this.prisma.userRole.count({
      where: { roleId: id },
    });
    if (assignmentCount > 0) {
      throw new ConflictException({
        code: 'ROLE_IN_USE',
        message: 'Cannot delete a role that is currently assigned to a user.',
        field: null,
      });
    }

    await this.prisma.role.delete({ where: { id } });
  }

  /** Fetches the role and enforces the isSystem/ownership rules shared by update() and remove(). */
  private async assertMutable(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: `Role with id ${id} was not found.`,
        field: null,
      });
    }
    if (role.isSystem) {
      throw new ForbiddenException({
        code: 'SYSTEM_ROLE_PROTECTED',
        message: 'System roles cannot be updated or deleted.',
        field: null,
      });
    }
    if (!isPlatformAdmin(caller) && role.companyId !== caller.companyId) {
      throw new ForbiddenException({
        code: 'ROLE_ACCESS_DENIED',
        message: 'You do not have access to this role.',
        field: null,
      });
    }
  }

  private async assertPermissionsExist(permissionIds: string[]): Promise<void> {
    const existing = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
    });
    if (existing.length !== new Set(permissionIds).size) {
      throw new NotFoundException({
        code: 'PERMISSION_NOT_FOUND',
        message: 'One or more permissionIds were not found.',
        field: 'permissionIds',
      });
    }
  }

  private mapWriteError(error: unknown, name?: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === PRISMA_UNIQUE_CONSTRAINT) {
        return new ConflictException({
          code: 'ROLE_NAME_ALREADY_EXISTS',
          message: `A role named "${name}" already exists for this company.`,
          field: 'name',
        });
      }
      if (error.code === PRISMA_FOREIGN_KEY_CONSTRAINT) {
        return new NotFoundException({
          code: 'COMPANY_NOT_FOUND',
          message: 'The specified companyId was not found.',
          field: 'companyId',
        });
      }
    }
    return error;
  }
}
