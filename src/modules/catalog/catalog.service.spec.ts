import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CatalogService } from './catalog.service';

describe('CatalogService (FR-401 lookups)', () => {
  let prisma: PrismaService;
  let catalog: CatalogService;
  let companyId: string;
  let caller: AuthenticatedUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [CatalogService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    catalog = moduleRef.get(CatalogService);
    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
    const company = await prisma.company.create({
      data: {
        name: `Catalog Co ${randomUUID().slice(0, 8)}`,
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
  });

  afterAll(async () => {
    await prisma.brand.deleteMany({ where: { companyId } });
    await prisma.family.deleteMany({ where: { companyId } });
    await prisma.size.deleteMany({ where: { companyId } });
    await prisma.colour.deleteMany({ where: { companyId } });
    await prisma.itemCategory.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('creates simple lookups and enforces name uniqueness per company', async () => {
    const brand = await catalog.create('brand', { name: 'Acme' }, caller);
    expect(brand.name).toBe('Acme');
    expect(brand.parentId).toBeUndefined(); // simple lookup has no parentId
    await expect(
      catalog.create('brand', { name: 'Acme' }, caller),
    ).rejects.toMatchObject({ response: { code: 'LOOKUP_NAME_EXISTS' } });

    // Same name is fine in a different lookup type.
    const size = await catalog.create('size', { name: 'Acme' }, caller);
    expect(size.name).toBe('Acme');
  });

  it('nests categories and rejects a parent cycle', async () => {
    const parent = await catalog.create(
      'itemCategory',
      { name: 'Electronics' },
      caller,
    );
    const child = await catalog.create(
      'itemCategory',
      { name: 'Phones', parentId: parent.id },
      caller,
    );
    expect(child.parentId).toBe(parent.id);

    // Making the parent a child of its own child = cycle.
    await expect(
      catalog.update('itemCategory', parent.id, { parentId: child.id }, caller),
    ).rejects.toMatchObject({ response: { code: 'CATEGORY_CYCLE' } });
  });

  it('blocks deleting a category that has children', async () => {
    const parent = await catalog.create(
      'itemCategory',
      { name: 'Clothing' },
      caller,
    );
    await catalog.create(
      'itemCategory',
      { name: 'Shirts', parentId: parent.id },
      caller,
    );
    await expect(
      catalog.remove('itemCategory', parent.id, caller),
    ).rejects.toMatchObject({ response: { code: 'CATEGORY_HAS_CHILDREN' } });
  });

  it('rejects a non-existent parent category', async () => {
    await expect(
      catalog.create(
        'itemCategory',
        { name: 'Orphan', parentId: randomUUID() },
        caller,
      ),
    ).rejects.toMatchObject({
      response: { code: 'PARENT_CATEGORY_NOT_FOUND' },
    });
  });
});
