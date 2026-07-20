import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Account, ControlType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Paginated } from '../../common/types/paginated.type';
import {
  isPlatformAdmin,
  type AuthenticatedUser,
} from '../auth/interfaces/authenticated-user.interface';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { QueryAccountDto } from './dto/query-account.dto';
import { AccountResponseDto } from './dto/account-response.dto';
import { AccountTreeNodeDto } from './dto/account-tree-node.dto';
import { ImportChartResultDto } from './dto/import-chart-result.dto';
import { DEFAULT_CHART, type DefaultAccountSeed } from './account-defaults';
import { OFFICIAL_CHART_REST } from './official-chart';

// The full official chart is large (600+ rows); give the import transaction
// generous headroom over Prisma's 5s interactive-transaction default.
const IMPORT_TRANSACTION_TIMEOUT_MS = 60_000;

const PRISMA_UNIQUE_CONSTRAINT = 'P2002';
const PRISMA_FOREIGN_KEY_CONSTRAINT = 'P2003';
const ALLOWED_SORT_FIELDS = [
  'number',
  'name',
  'accountClass',
  'isActive',
  'createdAt',
  'updatedAt',
];

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Platform admin gets the bare client and targets a company via the DTO;
   * a company-scoped caller gets forTenant(companyId), which forces every
   * read/write to their own company. Identical to BranchesService.
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
    dto: CreateAccountDto,
    caller: AuthenticatedUser,
  ): Promise<AccountResponseDto> {
    this.validateControl(dto.isControl ?? false, dto.controlType ?? null);
    if (dto.currencyRestriction) {
      await this.assertCurrencyExists(dto.currencyRestriction);
    }
    const client = this.clientFor(caller);
    if (dto.parentId) {
      await this.assertParentExists(dto.parentId, client);
    }
    try {
      const account = await client.account.create({
        data: dto as Prisma.AccountUncheckedCreateInput,
      });
      return AccountResponseDto.fromEntity(account);
    } catch (error) {
      throw this.mapWriteError(error, dto.number, dto.companyId);
    }
  }

  async findAll(
    query: QueryAccountDto,
    caller: AuthenticatedUser,
  ): Promise<Paginated<AccountResponseDto>> {
    const { page, limit, sortOrder } = query;
    const sortBy = ALLOWED_SORT_FIELDS.includes(query.sortBy)
      ? query.sortBy
      : 'number';
    const where = this.buildWhere(query);
    const orderBy = {
      [sortBy]: sortOrder,
    } as Prisma.AccountOrderByWithRelationInput;
    const client = this.clientFor(caller);

    const [accounts, total] = await this.prisma.$transaction([
      client.account.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      client.account.count({ where }),
    ]);

    return Paginated.of(
      accounts.map(AccountResponseDto.fromEntity),
      total,
      page,
      limit,
    );
  }

  /** The full chart as a nested tree (FR-104), ordered by number at each level. */
  async findTree(
    caller: AuthenticatedUser,
    companyId?: string,
  ): Promise<AccountTreeNodeDto[]> {
    const where: Prisma.AccountWhereInput = { deletedAt: null };
    if (companyId) {
      where.companyId = companyId;
    }
    const accounts = await this.clientFor(caller).account.findMany({
      where,
      orderBy: { number: 'asc' },
    });
    return this.buildTree(accounts);
  }

  async findOne(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<AccountResponseDto> {
    const account = await this.clientFor(caller).account.findFirst({
      where: { id, deletedAt: null },
    });
    if (!account) {
      throw this.notFound(id);
    }
    return AccountResponseDto.fromEntity(account);
  }

  async update(
    id: string,
    dto: UpdateAccountDto,
    caller: AuthenticatedUser,
  ): Promise<AccountResponseDto> {
    const existing = await this.findOne(id, caller);
    const client = this.clientFor(caller);

    this.validateControl(
      dto.isControl ?? existing.isControl,
      dto.controlType !== undefined ? dto.controlType : existing.controlType,
    );
    if (dto.currencyRestriction) {
      await this.assertCurrencyExists(dto.currencyRestriction);
    }
    if (dto.parentId !== undefined && dto.parentId !== null) {
      await this.assertParentExists(dto.parentId, client);
      await this.assertNoCycle(id, dto.parentId, client);
    }

    try {
      const account = await client.account.update({
        where: { id },
        data: dto,
      });
      return AccountResponseDto.fromEntity(account);
    } catch (error) {
      throw this.mapWriteError(error, dto.number ?? existing.number);
    }
  }

  async remove(id: string, caller: AuthenticatedUser): Promise<void> {
    await this.findOne(id, caller);
    const client = this.clientFor(caller);
    const childCount = await client.account.count({
      where: { parentId: id, deletedAt: null },
    });
    if (childCount > 0) {
      throw new ConflictException({
        code: 'ACCOUNT_HAS_CHILDREN',
        message: `Account ${id} has ${childCount} child account(s) and cannot be deleted. Delete or re-parent them first.`,
        field: null,
      });
    }
    await client.account.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Populate the default Plan Comptable Libanais for the caller's company
   * (FR-104). Idempotent — accounts whose number already exists are skipped, so
   * it is safe to call more than once. Returns the accounts created this call.
   */
  async seedDefault(caller: AuthenticatedUser): Promise<AccountResponseDto[]> {
    if (isPlatformAdmin(caller)) {
      throw new BadRequestException({
        code: 'COMPANY_SCOPE_REQUIRED',
        message:
          'Seeding the default chart requires a company-scoped user (a platform admin has no company to seed into).',
        field: null,
      });
    }
    const created = await this.applyDefaultChart(
      caller.companyId as string,
      this.prisma,
    );
    return created.map(AccountResponseDto.fromEntity);
  }

  /**
   * Seed the common subset of the Plan Comptable Libanais for a company
   * (FR-104). Idempotent — numbers that already exist are skipped. `client` may
   * be a transaction client — this is how AuthService.register seeds a
   * brand-new company's chart in the same transaction that creates the company.
   */
  async applyDefaultChart(
    companyId: string,
    client: Prisma.TransactionClient,
  ): Promise<Account[]> {
    return this.insertSeeds(companyId, DEFAULT_CHART, client);
  }

  /**
   * Import the remainder of the full official chart (everything not in the
   * common subset already seeded at registration), once per company. Blocked
   * with 409 if it has already run for this company.
   */
  async importOfficialChart(
    caller: AuthenticatedUser,
  ): Promise<ImportChartResultDto> {
    if (isPlatformAdmin(caller)) {
      throw new BadRequestException({
        code: 'COMPANY_SCOPE_REQUIRED',
        message:
          'Importing the official chart requires a company-scoped user (a platform admin has no company to import into).',
        field: null,
      });
    }
    const companyId = caller.companyId as string;
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (company?.officialChartImportedAt) {
      throw new ConflictException({
        code: 'OFFICIAL_CHART_ALREADY_IMPORTED',
        message:
          'The full official chart has already been imported for this company.',
        field: null,
      });
    }

    const imported = await this.prisma.$transaction(
      async (tx) => {
        const created = await this.insertSeeds(
          companyId,
          OFFICIAL_CHART_REST,
          tx,
        );
        await tx.company.update({
          where: { id: companyId },
          data: { officialChartImportedAt: new Date() },
        });
        return created.length;
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS },
    );
    return { imported };
  }

  /**
   * Insert a list of seed accounts for a company, resolving each parent by
   * number. Skips numbers that already exist (idempotent). Ids are generated up
   * front so parentId resolves in one pass — parents already in the DB, or
   * earlier in the same seed list (parents always precede children), both
   * resolve — and the whole set is written with a single createMany.
   */
  private async insertSeeds(
    companyId: string,
    seeds: DefaultAccountSeed[],
    client: Prisma.TransactionClient,
  ): Promise<Account[]> {
    const existing = await client.account.findMany({
      where: { companyId },
      select: { number: true, id: true },
    });
    const idByNumber = new Map<string, string>(
      existing.map((a) => [a.number, a.id]),
    );
    const toCreate = seeds.filter((s) => !idByNumber.has(s.number));
    if (toCreate.length === 0) {
      return [];
    }
    for (const seed of toCreate) {
      idByNumber.set(seed.number, randomUUID());
    }

    const rows: Prisma.AccountCreateManyInput[] = toCreate.map((seed) => ({
      id: idByNumber.get(seed.number),
      companyId,
      number: seed.number,
      name: seed.name,
      nameAr: seed.nameAr,
      nameFr: seed.nameFr,
      nameEn: seed.nameEn,
      accountClass: seed.accountClass,
      type: seed.type,
      normalBalance: seed.normalBalance,
      parentId: seed.parentNumber
        ? (idByNumber.get(seed.parentNumber) ?? null)
        : null,
      isControl: seed.isControl ?? false,
      controlType: seed.controlType ?? null,
    }));

    await client.account.createMany({ data: rows });
    return client.account.findMany({
      where: { companyId, number: { in: toCreate.map((s) => s.number) } },
    });
  }

  private buildTree(accounts: Account[]): AccountTreeNodeDto[] {
    const nodes = new Map<string, AccountTreeNodeDto>();
    for (const account of accounts) {
      const node = AccountResponseDto.fromEntity(account) as AccountTreeNodeDto;
      node.children = [];
      nodes.set(account.id, node);
    }
    const roots: AccountTreeNodeDto[] = [];
    for (const account of accounts) {
      const node = nodes.get(account.id) as AccountTreeNodeDto;
      const parent = account.parentId ? nodes.get(account.parentId) : undefined;
      // A row whose parent was filtered out (e.g. soft-deleted) surfaces at the
      // root so it is never silently dropped from the tree.
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private buildWhere(query: QueryAccountDto): Prisma.AccountWhereInput {
    const where: Prisma.AccountWhereInput = { deletedAt: null };
    if (query.accountClass !== undefined) {
      where.accountClass = query.accountClass;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.isControl !== undefined) {
      where.isControl = query.isControl;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.parentId) {
      where.parentId = query.parentId;
    }
    if (query.companyId) {
      where.companyId = query.companyId;
    }
    if (query.search) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private validateControl(
    isControl: boolean,
    controlType: ControlType | null,
  ): void {
    if (isControl && !controlType) {
      throw new BadRequestException({
        code: 'CONTROL_TYPE_REQUIRED',
        message: 'A control account must specify a controlType.',
        field: 'controlType',
      });
    }
    if (!isControl && controlType) {
      throw new BadRequestException({
        code: 'CONTROL_TYPE_WITHOUT_CONTROL_FLAG',
        message: 'controlType is only valid when isControl is true.',
        field: 'controlType',
      });
    }
  }

  private async assertParentExists(
    parentId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const parent = await client.account.findFirst({
      where: { id: parentId, deletedAt: null },
    });
    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_ACCOUNT_NOT_FOUND',
        message: `Parent account with id ${parentId} was not found.`,
        field: 'parentId',
      });
    }
  }

  /** Reject re-parenting an account under itself or one of its descendants. */
  private async assertNoCycle(
    id: string,
    parentId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === id) {
        throw new BadRequestException({
          code: 'ACCOUNT_CYCLE',
          message: 'An account cannot be its own ancestor.',
          field: 'parentId',
        });
      }
      const parent: { parentId: string | null } | null =
        await client.account.findFirst({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = parent?.parentId ?? null;
    }
  }

  private async assertCurrencyExists(code: string): Promise<void> {
    const currency = await this.prisma.currency.findUnique({ where: { code } });
    if (!currency) {
      throw new NotFoundException({
        code: 'CURRENCY_NOT_FOUND',
        message: `Currency with code ${code} was not found.`,
        field: 'currencyRestriction',
      });
    }
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({
      code: 'ACCOUNT_NOT_FOUND',
      message: `Account with id ${id} was not found.`,
      field: null,
    });
  }

  private mapWriteError(
    error: unknown,
    number: string,
    companyId?: string,
  ): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === PRISMA_UNIQUE_CONSTRAINT) {
        return new ConflictException({
          code: 'ACCOUNT_NUMBER_ALREADY_EXISTS',
          message: `An account with number ${number} already exists in this company.`,
          field: 'number',
        });
      }
      if (error.code === PRISMA_FOREIGN_KEY_CONSTRAINT) {
        // Parent and currency FKs are pre-validated, so a FK failure here is the
        // company FK (platform-admin path with an unknown companyId).
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
