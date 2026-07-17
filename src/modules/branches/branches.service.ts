import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchResponseDto } from './dto/branch-response.dto';

const PRISMA_FOREIGN_KEY_CONSTRAINT = 'P2003';
const ALLOWED_SORT_FIELDS = ['name', 'isActive', 'createdAt', 'updatedAt'];

// TODO(FR-401/FR-404): when the inventory `Location` model ships, add its FK
// and make Branch.stockLocationId NOT-NULL (see prisma/schema.prisma).

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A platform admin/support caller (no companyId of their own) gets the bare
   * client — they must name the target company via the DTO's companyId. A
   * company-scoped caller gets forTenant(companyId), which forces every
   * read/write to their own company, silently overriding any companyId they
   * submit. Same mechanism used by UsersService — see prisma-tenant.spec.ts
   * for why the cast bridges a TypeScript-only branding difference.
   */
  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) {
      return this.prisma;
    }
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  async create(
    dto: CreateBranchDto,
    caller: AuthenticatedUser,
  ): Promise<BranchResponseDto> {
    const client = this.clientFor(caller);
    try {
      // companyId is optional on the DTO but required on the model — a
      // company-scoped caller has it injected by forTenant(), a platform admin
      // supplies it in the body. The unchecked input reflects that runtime
      // guarantee (a bad/missing companyId surfaces as the P2003 mapped below).
      const branch = await client.branch.create({
        data: dto as Prisma.BranchUncheckedCreateInput,
      });
      return BranchResponseDto.fromEntity(branch);
    } catch (error) {
      throw this.mapWriteError(error, dto.companyId);
    }
  }

  async findAll(
    query: PaginationQueryDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<BranchResponseDto>> {
    const client = this.clientFor(caller);
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
    const where: Prisma.BranchWhereInput = { deletedAt: null };
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.BranchOrderByWithRelationInput;

    const [branches, total] = await this.prisma.$transaction([
      client.branch.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      client.branch.count({ where }),
    ]);

    return Paginated.of(
      branches.map(BranchResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<BranchResponseDto> {
    const branch = await this.clientFor(caller).branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException({
        code: 'BRANCH_NOT_FOUND',
        message: `Branch with id ${id} was not found.`,
        field: null,
      });
    }
    return BranchResponseDto.fromEntity(branch);
  }

  async update(
    id: string,
    dto: UpdateBranchDto,
    caller: AuthenticatedUser,
  ): Promise<BranchResponseDto> {
    await this.findOne(id, caller);
    const client = this.clientFor(caller);
    try {
      const branch = await client.branch.update({
        where: { id },
        data: dto as Prisma.BranchUncheckedUpdateInput,
      });
      return BranchResponseDto.fromEntity(branch);
    } catch (error) {
      throw this.mapWriteError(error, dto.companyId);
    }
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.findOne(id, caller);
    await this.clientFor(caller).branch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private mapWriteError(error: unknown, companyId?: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_FOREIGN_KEY_CONSTRAINT
    ) {
      return new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: `Company with id ${companyId} was not found.`,
        field: 'companyId',
      });
    }
    return error;
  }
}
