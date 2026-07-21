import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Add a model name here the moment it gets a companyId column (Account,
// Branch, Partner, Item, ...). This is the only line that changes as new
// company-owned models are added.
const TENANT_SCOPED_MODELS = new Set([
  'User',
  'Branch',
  'ExchangeRate',
  'Account',
  'TaxRate',
  'DocumentSequence',
]);

const OPERATIONS_WITH_WHERE = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);
const OPERATIONS_FORCING_SINGLE_DATA = new Set([
  'create',
  'update',
  'updateMany',
]);
const OPERATIONS_FORCING_MANY_DATA = new Set([
  'createMany',
  'createManyAndReturn',
]);

/**
 * Thin wrapper around PrismaClient that ties the database connection to the
 * Nest lifecycle. This is the ONLY responsibility of this file — data models
 * and queries are added by each module as it is implemented.
 *
 * Prisma 7 requires a driver adapter; we use the node-postgres (pg) adapter,
 * reading the connection string from DATABASE_URL (loaded via ConfigModule).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Returns a client that forces every read and write on tenant-scoped
   * models to companyId — merged into `where` on reads, and overridden in
   * `data` on writes so a caller can never read or reassign a row across
   * companies. Cross-tenant/admin code intentionally uses the bare
   * PrismaService instead of this method.
   */
  forTenant(companyId: string) {
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || !TENANT_SCOPED_MODELS.has(model)) {
              return query(args);
            }
            const scoped = args as Record<string, unknown>;

            if (OPERATIONS_WITH_WHERE.has(operation)) {
              scoped.where = {
                ...(scoped.where as Record<string, unknown> | undefined),
                companyId,
              };
            }
            if (OPERATIONS_FORCING_SINGLE_DATA.has(operation)) {
              scoped.data = {
                ...(scoped.data as Record<string, unknown> | undefined),
                companyId,
              };
            }
            if (OPERATIONS_FORCING_MANY_DATA.has(operation)) {
              const items = scoped.data as Record<string, unknown>[];
              scoped.data = items.map((item) => ({ ...item, companyId }));
            }
            if (operation === 'upsert') {
              scoped.create = {
                ...(scoped.create as Record<string, unknown> | undefined),
                companyId,
              };
              scoped.update = {
                ...(scoped.update as Record<string, unknown> | undefined),
                companyId,
              };
            }

            return query(scoped);
          },
        },
      },
    });
  }
}
