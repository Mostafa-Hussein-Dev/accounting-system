import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('PrismaService.forTenant', () => {
  let prisma: PrismaService;
  let companyAId: string;
  let companyBId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);

    const suffix = randomUUID();
    const companyA = await prisma.company.create({
      data: { name: 'Tenant Test Co A', taxNumber: `TENANT-TEST-A-${suffix}` },
    });
    const companyB = await prisma.company.create({
      data: { name: 'Tenant Test Co B', taxNumber: `TENANT-TEST-B-${suffix}` },
    });
    companyAId = companyA.id;
    companyBId = companyB.id;

    const userA = await prisma.user.create({
      data: {
        firstName: 'A',
        lastName: 'Tester',
        email: `tenant-test-a-${suffix}@example.com`,
        passwordHash: 'irrelevant-for-this-test',
        companyId: companyAId,
      },
    });
    const userB = await prisma.user.create({
      data: {
        firstName: 'B',
        lastName: 'Tester',
        email: `tenant-test-b-${suffix}@example.com`,
        passwordHash: 'irrelevant-for-this-test',
        companyId: companyBId,
      },
    });
    userAId = userA.id;
    userBId = userB.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId] } },
    });
    await prisma.$disconnect();
  });

  it('findMany only returns rows for the scoped company', async () => {
    const users = await prisma.forTenant(companyAId).user.findMany({
      where: { id: { in: [userAId, userBId] } },
    });
    const ids = users.map((u) => u.id);
    expect(ids).toContain(userAId);
    expect(ids).not.toContain(userBId);
  });

  it('findUnique excludes a row belonging to a different company', async () => {
    const found = await prisma
      .forTenant(companyAId)
      .user.findUnique({ where: { id: userBId } });
    expect(found).toBeNull();
  });

  it('create forces companyId to the scoped tenant, ignoring the caller-supplied value', async () => {
    const suffix = randomUUID();
    const created = await prisma.forTenant(companyAId).user.create({
      data: {
        firstName: 'Forced',
        lastName: 'Create',
        email: `tenant-test-create-${suffix}@example.com`,
        passwordHash: 'irrelevant-for-this-test',
        companyId: companyBId,
      },
    });
    expect(created.companyId).toBe(companyAId);
    await prisma.user.delete({ where: { id: created.id } });
  });

  it('update cannot reassign a row to a different company', async () => {
    const updated = await prisma.forTenant(companyAId).user.update({
      where: { id: userAId },
      data: { companyId: companyBId },
    });
    expect(updated.companyId).toBe(companyAId);
  });
});
