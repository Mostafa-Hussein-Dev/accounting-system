import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { BranchesService } from './branches.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('BranchesService', () => {
  let prisma: PrismaService;
  let service: BranchesService;
  let companyAId: string;
  let companyBId: string;
  const createdBranchIds: string[] = [];
  let platformAdmin: AuthenticatedUser;
  let callerA: AuthenticatedUser;
  let callerB: AuthenticatedUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [BranchesService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(BranchesService);

    const suffix = randomUUID();
    const companyA = await prisma.company.create({
      data: { name: 'Branches Test Co A', taxNumber: `BR-TEST-A-${suffix}` },
    });
    const companyB = await prisma.company.create({
      data: { name: 'Branches Test Co B', taxNumber: `BR-TEST-B-${suffix}` },
    });
    companyAId = companyA.id;
    companyBId = companyB.id;

    platformAdmin = {
      userId: 'admin',
      companyId: null,
      isPlatformAdmin: true,
      mustChangePassword: false,
    };
    callerA = {
      userId: 'caller-a',
      companyId: companyAId,
      isPlatformAdmin: false,
      mustChangePassword: false,
    };
    callerB = {
      userId: 'caller-b',
      companyId: companyBId,
      isPlatformAdmin: false,
      mustChangePassword: false,
    };
  });

  afterAll(async () => {
    await prisma.branch.deleteMany({ where: { id: { in: createdBranchIds } } });
    await prisma.location.deleteMany({
      where: { companyId: { in: [companyAId, companyBId] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId] } },
    });
    await prisma.$disconnect();
  });

  it('lets a company-scoped caller create a branch in their own company', async () => {
    const branch = await service.create(
      { name: `Main ${randomUUID()}` },
      callerA,
    );
    createdBranchIds.push(branch.id);
    expect(branch.companyId).toBe(companyAId);
    expect(branch.isActive).toBe(true);
  });

  it("forces companyId to the caller's own company, overriding a submitted one", async () => {
    const branch = await service.create(
      { name: `Override ${randomUUID()}`, companyId: companyBId },
      callerA,
    );
    createdBranchIds.push(branch.id);
    expect(branch.companyId).toBe(companyAId);
  });

  it('lets a platform admin target a specific company via companyId', async () => {
    const branch = await service.create(
      { name: `Admin-made ${randomUUID()}`, companyId: companyBId },
      platformAdmin,
    );
    createdBranchIds.push(branch.id);
    expect(branch.companyId).toBe(companyBId);
  });

  it('rejects a platform admin create with an unknown companyId (404 COMPANY_NOT_FOUND)', async () => {
    await expect(
      service.create(
        { name: `Orphan ${randomUUID()}`, companyId: randomUUID() },
        platformAdmin,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("hides company A's branch from company B on findOne and findAll", async () => {
    const branch = await service.create(
      { name: `Private A ${randomUUID()}` },
      callerA,
    );
    createdBranchIds.push(branch.id);

    await expect(service.findOne(branch.id, callerB)).rejects.toThrow(
      NotFoundException,
    );

    const listAsB = await service.findAll(
      { page: 1, limit: 100, sortBy: 'createdAt', sortOrder: 'desc' },
      callerB,
    );
    expect(listAsB.data.map((b) => b.id)).not.toContain(branch.id);
  });

  it("blocks company B from updating or deleting company A's branch", async () => {
    const branch = await service.create(
      { name: `Guarded A ${randomUUID()}` },
      callerA,
    );
    createdBranchIds.push(branch.id);

    await expect(
      service.update(branch.id, { name: 'hacked' }, callerB),
    ).rejects.toThrow(NotFoundException);
    await expect(service.remove(branch.id, callerB)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lets a company update its own branch, including deactivating it', async () => {
    const branch = await service.create(
      { name: `Editable ${randomUUID()}` },
      callerA,
    );
    createdBranchIds.push(branch.id);

    const updated = await service.update(
      branch.id,
      { address: 'Hamra Street, Beirut', isActive: false },
      callerA,
    );
    expect(updated.address).toBe('Hamra Street, Beirut');
    expect(updated.isActive).toBe(false);
  });

  it('soft-deletes a branch: it disappears from reads but the row remains', async () => {
    const branch = await service.create(
      { name: `Deletable ${randomUUID()}` },
      callerA,
    );
    createdBranchIds.push(branch.id);

    await service.remove(branch.id, callerA);

    await expect(service.findOne(branch.id, callerA)).rejects.toThrow(
      NotFoundException,
    );
    const row = await prisma.branch.findUnique({ where: { id: branch.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it('persists trilingual names and a supplied stockLocationId', async () => {
    const loc = await prisma.location.create({
      data: {
        companyId: companyAId,
        code: `WH-${randomUUID().slice(0, 8)}`,
        name: 'Warehouse',
        type: 'INTERNAL',
      },
    });
    const branch = await service.create(
      {
        name: `Trilingual ${randomUUID()}`,
        nameAr: 'فرع',
        nameFr: 'Succursale',
        nameEn: 'Branch',
        stockLocationId: loc.id,
      },
      callerA,
    );
    createdBranchIds.push(branch.id);
    expect(branch.nameAr).toBe('فرع');
    expect(branch.nameFr).toBe('Succursale');
    expect(branch.nameEn).toBe('Branch');
    expect(branch.stockLocationId).toBe(loc.id);
  });

  it('auto-creates a default stock location when none is supplied', async () => {
    const branch = await service.create(
      { name: `Auto ${randomUUID()}` },
      callerA,
    );
    createdBranchIds.push(branch.id);
    expect(branch.stockLocationId).toBeTruthy();
    const loc = await prisma.location.findUnique({
      where: { id: branch.stockLocationId as string },
    });
    expect(loc?.type).toBe('INTERNAL');
    expect(loc?.branchId).toBe(branch.id);
  });

  it('rejects a supplied stockLocationId that is not an internal location in the company', async () => {
    await expect(
      service.create(
        { name: `Bad loc ${randomUUID()}`, stockLocationId: randomUUID() },
        callerA,
      ),
    ).rejects.toMatchObject({ response: { code: 'LOCATION_NOT_FOUND' } });
  });
});
