import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { UomType } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UomService } from './uom.service';

describe('UomService (FR-401)', () => {
  let prisma: PrismaService;
  let uom: UomService;
  let companyId: string;
  let caller: AuthenticatedUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [UomService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    uom = moduleRef.get(UomService);

    const company = await prisma.company.create({
      data: {
        name: `UoM Co ${randomUUID().slice(0, 8)}`,
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
    await prisma.currency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    });
  });

  afterAll(async () => {
    await prisma.uom.deleteMany({ where: { companyId } });
    await prisma.uomCategory.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('creates a category with a reference unit (factor forced to 1) and rejects a second reference', async () => {
    const cat = await uom.createCategory({ name: 'Quantity' }, caller);
    const unit = await uom.createUom(
      { categoryId: cat.id, name: 'Unit', type: UomType.REFERENCE, factor: 5 },
      caller,
    );
    expect(unit.factor).toBe(1); // reference always 1, ignoring the sent 5

    await expect(
      uom.createUom(
        { categoryId: cat.id, name: 'Piece', type: UomType.REFERENCE },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'UOM_REFERENCE_EXISTS' } });
  });

  it('requires a factor for a non-reference unit', async () => {
    const cat = await uom.createCategory({ name: 'NeedFactor' }, caller);
    await uom.createUom(
      { categoryId: cat.id, name: 'Ref', type: UomType.REFERENCE },
      caller,
    );
    await expect(
      uom.createUom(
        { categoryId: cat.id, name: 'Box', type: UomType.BIGGER },
        caller,
      ),
    ).rejects.toMatchObject({ response: { code: 'UOM_FACTOR_REQUIRED' } });
  });

  it('converts within a category and rejects cross-category conversion', async () => {
    const cat = await uom.createCategory({ name: 'Count' }, caller);
    const unit = await uom.createUom(
      { categoryId: cat.id, name: 'Each', type: UomType.REFERENCE },
      caller,
    );
    const dozen = await uom.createUom(
      { categoryId: cat.id, name: 'Dozen', type: UomType.BIGGER, factor: 12 },
      caller,
    );

    // 3 dozen -> 36 each
    const toEach = await uom.convert(
      { qty: 3, fromUomId: dozen.id, toUomId: unit.id },
      caller,
    );
    expect(toEach.result).toBe(36);
    // 36 each -> 3 dozen
    const toDozen = await uom.convert(
      { qty: 36, fromUomId: unit.id, toUomId: dozen.id },
      caller,
    );
    expect(toDozen.result).toBe(3);

    const otherCat = await uom.createCategory({ name: 'Weight' }, caller);
    const kg = await uom.createUom(
      { categoryId: otherCat.id, name: 'Kg', type: UomType.REFERENCE },
      caller,
    );
    await expect(
      uom.convert({ qty: 1, fromUomId: dozen.id, toUomId: kg.id }, caller),
    ).rejects.toMatchObject({ response: { code: 'UOM_CATEGORY_MISMATCH' } });
  });

  it('blocks deleting a category that still has units', async () => {
    const cat = await uom.createCategory({ name: 'HasUnits' }, caller);
    await uom.createUom(
      { categoryId: cat.id, name: 'U1', type: UomType.REFERENCE },
      caller,
    );
    await expect(uom.removeCategory(cat.id, caller)).rejects.toMatchObject({
      response: { code: 'UOM_CATEGORY_IN_USE' },
    });
  });
});
