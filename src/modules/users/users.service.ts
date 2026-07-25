import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const PRISMA_FOREIGN_KEY_CONSTRAINT = 'P2003';
const BCRYPT_SALT_ROUNDS = 12;
const DEFAULT_TEAMMATE_ROLE_NAME = 'Company Member';
const COMPANY_ADMIN_ROLE_NAME = 'Company Admin';
const ALLOWED_SORT_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'isActive',
  'createdAt',
  'updatedAt',
  'lastLoginAt',
];

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * caller resolves the target company for a normal API call; client lets
   * /auth/register pass a shared transaction client directly. When there is no
   * caller (register), the user is created bare — membership and the owner role
   * are set up by CompaniesService.provision in the same transaction.
   */
  async create(
    dto: CreateUserDto,
    caller?: AuthenticatedUser,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<UserResponseDto> {
    const { password, roleIds, companyId: dtoCompanyId, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Which company the new user joins (membership + roles):
    //  - register (no caller): none here (provision handles it)
    //  - company caller: their active company
    //  - platform admin: the company named in the DTO, if any
    let targetCompanyId: string | null = null;
    if (caller) {
      targetCompanyId = isPlatformAdmin(caller)
        ? (dtoCompanyId ?? null)
        : this.requireActiveCompany(caller);
    }

    try {
      const user = await client.user.create({
        data: { ...rest, passwordHash },
      });

      if (targetCompanyId) {
        await client.userCompany.create({
          data: { userId: user.id, companyId: targetCompanyId },
        });
        let resolvedRoleIds = roleIds;
        if (!resolvedRoleIds) {
          const defaultRole = await client.role.findFirst({
            where: { name: DEFAULT_TEAMMATE_ROLE_NAME, isSystem: true },
          });
          resolvedRoleIds = defaultRole ? [defaultRole.id] : [];
        }
        await this.assignRoles(
          client,
          user.id,
          targetCompanyId,
          resolvedRoleIds,
        );
      }

      return UserResponseDto.fromEntity(user);
    } catch (error) {
      throw this.mapWriteError(error, targetCompanyId ?? undefined);
    }
  }

  async findAll(
    query: PaginationQueryDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<UserResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
    const where = this.scopeWhere(caller);
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.UserOrderByWithRelationInput;

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      this.prisma.user.count({ where }),
    ]);

    return Paginated.of(
      users.map(UserResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(
    id: string,
    caller?: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    const where: Prisma.UserWhereInput = { id, deletedAt: null };
    if (caller && !isPlatformAdmin(caller)) {
      // A company user can only see users who share their active company.
      where.companies = {
        some: { companyId: this.requireActiveCompany(caller) },
      };
    }
    const user = await this.prisma.user.findFirst({ where });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User with id ${id} was not found.`,
        field: null,
      });
    }
    return UserResponseDto.fromEntity(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    caller: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    await this.findOne(id, caller); // enforces visibility
    // companyId is not a user column; drop it if present so it isn't written.
    const { roleIds, ...rest } = dto;
    delete rest.companyId;

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({ where: { id }, data: rest });
        if (roleIds) {
          const companyId = this.requireActiveCompany(caller);
          await this.assertNotRemovingLastCompanyAdmin(
            tx,
            id,
            companyId,
            roleIds,
          );
          await tx.userRole.deleteMany({ where: { userId: id, companyId } });
          await this.assignRoles(tx, id, companyId, roleIds);
        }
        return updated;
      });
      return UserResponseDto.fromEntity(user);
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /**
   * A company caller removes the user from their active company (membership +
   * that company's roles) — the user account itself survives if they belong to
   * other companies. A platform admin soft-deletes the user globally.
   */
  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.findOne(id, caller);

    if (isPlatformAdmin(caller)) {
      await this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return;
    }

    const companyId = this.requireActiveCompany(caller);
    await this.assertNotRemovingLastCompanyAdmin(
      this.prisma,
      id,
      companyId,
      [],
    );
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id, companyId } }),
      this.prisma.userCompany.deleteMany({ where: { userId: id, companyId } }),
    ]);
  }

  /** Returns the raw Prisma entity (including passwordHash) for credential checks. Auth-internal only — never expose this beyond the auth flow. */
  async findAuthUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  // --- helpers ---

  private scopeWhere(caller: AuthenticatedUser): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (!isPlatformAdmin(caller)) {
      where.companies = {
        some: { companyId: this.requireActiveCompany(caller) },
      };
    }
    return where;
  }

  private requireActiveCompany(caller: AuthenticatedUser): string {
    if (!caller.companyId) {
      throw new ForbiddenException({
        code: 'COMPANY_CONTEXT_REQUIRED',
        message:
          'No active company selected. Use POST /auth/switch-company to choose one.',
        field: null,
      });
    }
    return caller.companyId;
  }

  private async assignRoles(
    client: Prisma.TransactionClient,
    userId: string,
    companyId: string,
    roleIds: string[],
  ): Promise<void> {
    if (roleIds.length === 0) {
      return;
    }
    const existingRoles = await client.role.findMany({
      where: { id: { in: roleIds } },
    });
    if (existingRoles.length !== new Set(roleIds).size) {
      throw new NotFoundException({
        code: 'ROLE_NOT_FOUND',
        message: 'One or more roleIds were not found.',
        field: 'roleIds',
      });
    }
    await client.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId, companyId })),
      skipDuplicates: true,
    });
  }

  /**
   * Guards against a company ending up with zero Company Admins. newRoleIds is
   * the user's role set (for this company) AFTER the pending operation — an
   * empty array represents removing the user from the company entirely.
   */
  private async assertNotRemovingLastCompanyAdmin(
    client: Prisma.TransactionClient,
    userId: string,
    companyId: string,
    newRoleIds: string[],
  ): Promise<void> {
    const adminRole = await client.role.findFirst({
      where: { name: COMPANY_ADMIN_ROLE_NAME, isSystem: true },
    });
    if (!adminRole) {
      return;
    }
    const currentlyHasAdmin = await client.userRole.findUnique({
      where: {
        userId_roleId_companyId: { userId, roleId: adminRole.id, companyId },
      },
    });
    if (!currentlyHasAdmin || newRoleIds.includes(adminRole.id)) {
      return;
    }

    const otherAdminsCount = await client.userRole.count({
      where: {
        roleId: adminRole.id,
        companyId,
        userId: { not: userId },
        user: { deletedAt: null },
      },
    });
    if (otherAdminsCount === 0) {
      throw new ConflictException({
        code: 'LAST_COMPANY_ADMIN',
        message: "Cannot remove the company's last admin.",
        field: 'roleIds',
      });
    }
  }

  private mapWriteError(error: unknown, companyId?: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === PRISMA_UNIQUE_CONSTRAINT) {
        return new ConflictException({
          code: 'USER_EMAIL_ALREADY_EXISTS',
          message: 'A user with this email already exists.',
          field: 'email',
        });
      }
      if (error.code === PRISMA_FOREIGN_KEY_CONSTRAINT) {
        return new NotFoundException({
          code: 'COMPANY_NOT_FOUND',
          message: `Company with id ${companyId} was not found.`,
          field: 'companyId',
        });
      }
    }
    return error;
  }
}
