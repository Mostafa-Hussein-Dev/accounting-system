import {
  ConflictException,
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
   * A platform admin/support caller (no companyId of their own) gets the bare
   * client — full flexibility, including creating another company-less admin.
   * A company-scoped caller gets forTenant(companyId), which forces every
   * read and write to their own company — they can never see, create, or
   * move a user into another company.
   *
   * forTenant() returns a Prisma Client Extension instance whose delegate
   * methods are runtime-identical to the base client (proven by
   * prisma-tenant.spec.ts) but carry $extends generic branding that doesn't
   * structurally unify with Prisma.TransactionClient — the cast below bridges
   * that TypeScript limitation, not a real behavioral difference.
   */
  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) {
      return this.prisma;
    }
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  /**
   * caller resolves the scoped client for a normal API call; client lets
   * /auth/register pass a shared transaction client directly (no caller
   * exists yet — the company was just created in the same transaction).
   */
  async create(
    dto: CreateUserDto,
    caller?: AuthenticatedUser,
    client: Prisma.TransactionClient = caller
      ? this.clientFor(caller)
      : this.prisma,
  ): Promise<UserResponseDto> {
    const { password, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    try {
      const user = await client.user.create({
        data: { ...rest, passwordHash },
      });
      return UserResponseDto.fromEntity(user);
    } catch (error) {
      throw this.mapWriteError(error, dto.companyId);
    }
  }

  async findAll(
    query: PaginationQueryDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<UserResponseDto>> {
    const client = this.clientFor(caller);
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
    const where: Prisma.UserWhereInput = { deletedAt: null };
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.UserOrderByWithRelationInput;

    const [users, total] = await this.prisma.$transaction([
      client.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      client.user.count({ where }),
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
    const client = caller ? this.clientFor(caller) : this.prisma;
    const user = await client.user.findFirst({
      where: { id, deletedAt: null },
    });
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
    await this.findOne(id, caller);
    const client = this.clientFor(caller);
    try {
      const user = await client.user.update({ where: { id }, data: dto });
      return UserResponseDto.fromEntity(user);
    } catch (error) {
      throw this.mapWriteError(error, dto.companyId);
    }
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.findOne(id, caller);
    const client = this.clientFor(caller);
    await client.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
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
