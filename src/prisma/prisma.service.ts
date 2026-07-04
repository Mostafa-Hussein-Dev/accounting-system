import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

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
}
