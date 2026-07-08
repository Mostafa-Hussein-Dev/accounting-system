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

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const { password, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: { ...rest, passwordHash },
      });
      return UserResponseDto.fromEntity(user);
    } catch (error) {
      throw this.mapWriteError(error, dto.companyId);
    }
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<Paginated<UserResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
    const where: Prisma.UserWhereInput = { deletedAt: null };
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

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findFirst({
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

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    await this.findOne(id);
    try {
      const user = await this.prisma.user.update({ where: { id }, data: dto });
      return UserResponseDto.fromEntity(user);
    } catch (error) {
      throw this.mapWriteError(error, dto.companyId);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.user.update({
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
