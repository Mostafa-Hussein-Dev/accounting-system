import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LocationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import {
  CreateLocationDto,
  LocationResponseDto,
  QueryLocationDto,
  UpdateLocationDto,
} from './dto/location.dto';

const PRISMA_UNIQUE = 'P2002';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  private clientFor(caller: AuthenticatedUser): Prisma.TransactionClient {
    if (isPlatformAdmin(caller)) {
      return this.prisma;
    }
    return this.prisma.forTenant(
      caller.companyId as string,
    ) as unknown as Prisma.TransactionClient;
  }

  private companyId(
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

  async create(
    dto: CreateLocationDto,
    caller: AuthenticatedUser,
  ): Promise<LocationResponseDto> {
    const companyId = this.companyId(dto.companyId, caller);
    await this.assertBranch(dto.branchId, companyId);
    try {
      const row = await this.clientFor(caller).location.create({
        data: {
          companyId,
          code: dto.code,
          name: dto.name,
          nameAr: dto.nameAr ?? null,
          nameFr: dto.nameFr ?? null,
          nameEn: dto.nameEn ?? null,
          // Users only create real (INTERNAL) locations; the virtual
          // counterparties are seeded and never created via the API.
          type: LocationType.INTERNAL,
          branchId: dto.branchId,
          isActive: dto.isActive ?? true,
        },
      });
      return LocationResponseDto.fromEntity(row);
    } catch (error) {
      throw this.mapCode(error, dto.code);
    }
  }

  async findAll(
    query: QueryLocationDto,
    caller: AuthenticatedUser,
  ): Promise<LocationResponseDto[]> {
    const where: Prisma.LocationWhereInput = { deletedAt: null };
    if (query.type) where.type = query.type;
    if (query.branchId) where.branchId = query.branchId;
    if (query.companyId) where.companyId = query.companyId;
    const rows = await this.clientFor(caller).location.findMany({
      where,
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
    return rows.map(LocationResponseDto.fromEntity);
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<LocationResponseDto> {
    return LocationResponseDto.fromEntity(await this.getOwned(id, caller));
  }

  async update(
    id: string,
    dto: UpdateLocationDto,
    caller: AuthenticatedUser,
  ): Promise<LocationResponseDto> {
    const existing = await this.getOwned(id, caller);
    if (existing.type !== LocationType.INTERNAL) {
      throw new BadRequestException({
        code: 'LOCATION_VIRTUAL_READONLY',
        message: 'Virtual (counterparty) locations cannot be edited.',
        field: null,
      });
    }
    if (dto.branchId) {
      await this.assertBranch(dto.branchId, existing.companyId);
    }
    const row = await this.clientFor(caller).location.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.nameFr !== undefined ? { nameFr: dto.nameFr } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return LocationResponseDto.fromEntity(row);
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    const existing = await this.getOwned(id, caller);
    if (existing.type !== LocationType.INTERNAL) {
      throw new BadRequestException({
        code: 'LOCATION_VIRTUAL_READONLY',
        message: 'Virtual (counterparty) locations cannot be deleted.',
        field: null,
      });
    }
    // A branch's default location must not be deleted out from under it.
    const isDefault = await this.prisma.branch.count({
      where: { stockLocationId: id },
    });
    if (isDefault > 0) {
      throw new ConflictException({
        code: 'LOCATION_IS_BRANCH_DEFAULT',
        message:
          'This location is a branch default stock location; reassign the branch first.',
        field: null,
      });
    }
    // Any stock ever moved through it means it carries ledger history.
    const moved = await this.prisma.stockMovement.count({
      where: { OR: [{ fromLocationId: id }, { toLocationId: id }] },
    });
    if (moved > 0) {
      throw new ConflictException({
        code: 'LOCATION_HAS_MOVEMENTS',
        message: `This location has ${moved} stock movement(s); deactivate it instead of deleting.`,
        field: null,
      });
    }
    await this.clientFor(caller).location.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // --- helpers -------------------------------------------------------------

  private async getOwned(id: string, caller: AuthenticatedUser) {
    const row = await this.clientFor(caller).location.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: `Location ${id} was not found.`,
        field: null,
      });
    }
    return row;
  }

  private async assertBranch(
    branchId: string,
    companyId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, companyId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException({
        code: 'BRANCH_NOT_FOUND',
        message: `Branch ${branchId} was not found in this company.`,
        field: 'branchId',
      });
    }
  }

  private mapCode(error: unknown, code: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE
    ) {
      return new ConflictException({
        code: 'LOCATION_CODE_EXISTS',
        message: `The code "${code}" is already used in this company.`,
        field: 'code',
      });
    }
    return error;
  }
}
