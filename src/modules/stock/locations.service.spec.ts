import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { LocationType } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { LocationsService } from './locations.service';

describe('LocationsService (FR-402)', () => {
  let prisma: PrismaService;
  let locations: LocationsService;
  let companyId: string;
  let branchId: string;
  let caller: AuthenticatedUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [LocationsService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    locations = moduleRef.get(LocationsService);

    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    const company = await prisma.company.create({
      data: {
        name: `Loc Co ${randomUUID().slice(0, 8)}`,
        baseCurrencyCode: 'USD',
      },
    });
    companyId = company.id;
    caller = {
      userId: randomUUID(),
      companyId,
      isPlatformAdmin: false,
      mustChangePassword: false,
    };
    // A branch needs a default stock location, which needs a branch — break the
    // cycle by making a branch-less location first, then the branch.
    const seed = await prisma.location.create({
      data: {
        companyId,
        code: 'SEED',
        name: 'Seed',
        type: LocationType.INTERNAL,
      },
    });
    const branch = await prisma.branch.create({
      data: { companyId, name: 'Main', stockLocationId: seed.id },
    });
    branchId = branch.id;
  });

  afterAll(async () => {
    await prisma.branch.deleteMany({ where: { companyId } });
    await prisma.location.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('creates an INTERNAL location and rejects a duplicate code', async () => {
    const loc = await locations.create(
      { code: 'WH-1', name: 'Warehouse 1', branchId },
      caller,
    );
    expect(loc.type).toBe(LocationType.INTERNAL);
    expect(loc.branchId).toBe(branchId);

    await expect(
      locations.create({ code: 'WH-1', name: 'Dup', branchId }, caller),
    ).rejects.toMatchObject({ response: { code: 'LOCATION_CODE_EXISTS' } });
  });

  it('rejects create for an unknown branch', async () => {
    await expect(
      locations.create(
        { code: 'WH-2', name: 'Warehouse 2', branchId: randomUUID() },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'BRANCH_NOT_FOUND' } });
  });

  it('refuses to edit or delete a virtual location', async () => {
    const virt = await prisma.location.create({
      data: {
        companyId,
        code: 'CUS',
        name: 'Customers',
        type: LocationType.CUSTOMER,
      },
    });
    await expect(
      locations.update(virt.id, { name: 'x' }, caller),
    ).rejects.toMatchObject({
      response: { code: 'LOCATION_VIRTUAL_READONLY' },
    });
    await expect(locations.remove(virt.id, caller)).rejects.toMatchObject({
      response: { code: 'LOCATION_VIRTUAL_READONLY' },
    });
  });
});
