import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

// Uses Branch, a tenant-scoped model (User is no longer tenant-scoped — company
// access is via UserCompany membership, not a companyId column on the user).
describe('PrismaService.forTenant', () => {
  let prisma: PrismaService;
  let companyAId: string;
  let companyBId: string;
  let branchAId: string;
  let branchBId: string;

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

    const branchA = await prisma.branch.create({
      data: { companyId: companyAId, name: 'Branch A' },
    });
    const branchB = await prisma.branch.create({
      data: { companyId: companyBId, name: 'Branch B' },
    });
    branchAId = branchA.id;
    branchBId = branchB.id;
  });

  afterAll(async () => {
    await prisma.branch.deleteMany({
      where: { companyId: { in: [companyAId, companyBId] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId] } },
    });
    await prisma.$disconnect();
  });

  it('findMany only returns rows for the scoped company', async () => {
    const branches = await prisma.forTenant(companyAId).branch.findMany({
      where: { id: { in: [branchAId, branchBId] } },
    });
    const ids = branches.map((b) => b.id);
    expect(ids).toContain(branchAId);
    expect(ids).not.toContain(branchBId);
  });

  it('findUnique excludes a row belonging to a different company', async () => {
    const found = await prisma
      .forTenant(companyAId)
      .branch.findUnique({ where: { id: branchBId } });
    expect(found).toBeNull();
  });

  it('create forces companyId to the scoped tenant, ignoring the caller-supplied value', async () => {
    const created = await prisma.forTenant(companyAId).branch.create({
      data: { companyId: companyBId, name: 'Forced Create' },
    });
    expect(created.companyId).toBe(companyAId);
    await prisma.branch.delete({ where: { id: created.id } });
  });

  it('update cannot reassign a row to a different company', async () => {
    const updated = await prisma.forTenant(companyAId).branch.update({
      where: { id: branchAId },
      data: { companyId: companyBId },
    });
    expect(updated.companyId).toBe(companyAId);
  });
});
