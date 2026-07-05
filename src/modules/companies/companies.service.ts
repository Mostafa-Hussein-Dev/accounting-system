import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Paginated } from '../../common/types/paginated.type';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyResponseDto } from './dto/company-response.dto';

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const ALLOWED_SORT_FIELDS = [
  'name',
  'taxNumber',
  'isActive',
  'createdAt',
  'updatedAt',
];

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompanyDto): Promise<CompanyResponseDto> {
    try {
      const company = await this.prisma.company.create({ data: dto });
      return CompanyResponseDto.fromEntity(company);
    } catch (error) {
      throw this.mapWriteError(error, dto.taxNumber);
    }
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<Paginated<CompanyResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'createdAt';
    const where: Prisma.CompanyWhereInput = { deletedAt: null };
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.CompanyOrderByWithRelationInput;

    const [companies, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      this.prisma.company.count({ where }),
    ]);

    return Paginated.of(
      companies.map(CompanyResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string): Promise<CompanyResponseDto> {
    const company = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: `Company with id ${id} was not found.`,
        field: null,
      });
    }
    return CompanyResponseDto.fromEntity(company);
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<CompanyResponseDto> {
    await this.findOne(id);
    try {
      const company = await this.prisma.company.update({
        where: { id },
        data: dto,
      });
      return CompanyResponseDto.fromEntity(company);
    } catch (error) {
      throw this.mapWriteError(error, dto.taxNumber);
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private mapWriteError(error: unknown, taxNumber?: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_CONSTRAINT
    ) {
      return new ConflictException({
        code: 'COMPANY_TAX_NUMBER_ALREADY_EXISTS',
        message: `A company with tax number "${taxNumber}" already exists.`,
        field: 'taxNumber',
      });
    }
    return error;
  }
}
