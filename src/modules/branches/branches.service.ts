import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LocationType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
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

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveCompanyId(
    dtoCompanyId: string | undefined,
    caller: AuthenticatedUser,
  ): string {
    if (!isPlatformAdmin(caller)) {
      if (!caller.companyId) {
        throw new BadRequestException({
          code: 'COMPANY_CONTEXT_REQUIRED',
          message:
            'No active company selected. Use POST /auth/switch-company to choose one.',
          field: null,
        });
      }
      return caller.companyId;
    }
    if (!dtoCompanyId) {
      throw new BadRequestException({
        code: 'COMPANY_ID_REQUIRED',
        message: 'A platform admin must specify companyId.',
        field: 'companyId',
      });
    }
    return dtoCompanyId;
  }

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
    const companyId = this.resolveCompanyId(dto.companyId, caller);
    try {
      // Every branch needs a default INTERNAL stock location (FR-402). The
      // caller may name an existing one; otherwise we create one and link it
      // back to the branch — all in one transaction so the NOT-NULL FK holds.
      const branch = await this.prisma.$transaction(async (tx) => {
        let stockLocationId = dto.stockLocationId;
        let autoCreated = false;
        if (stockLocationId) {
          const loc = await tx.location.findFirst({
            where: {
              id: stockLocationId,
              companyId,
              type: LocationType.INTERNAL,
              deletedAt: null,
            },
          });
          if (!loc) {
            throw new NotFoundException({
              code: 'LOCATION_NOT_FOUND',
              message: `Internal location ${stockLocationId} was not found in this company.`,
              field: 'stockLocationId',
            });
          }
        } else {
          const loc = await tx.location.create({
            data: {
              companyId,
              code: `STOCK-${randomUUID().slice(0, 8)}`,
              name: `Stock - ${dto.name}`,
              type: LocationType.INTERNAL,
            },
          });
          stockLocationId = loc.id;
          autoCreated = true;
        }
        const created = await tx.branch.create({
          data: {
            companyId,
            name: dto.name,
            nameAr: dto.nameAr ?? null,
            nameFr: dto.nameFr ?? null,
            nameEn: dto.nameEn ?? null,
            address: dto.address ?? null,
            stockLocationId,
          },
        });
        if (autoCreated) {
          await tx.location.update({
            where: { id: stockLocationId },
            data: { branchId: created.id },
          });
        }
        return created;
      });
      return BranchResponseDto.fromEntity(branch);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw this.mapWriteError(error, companyId);
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
        data: dto,
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
