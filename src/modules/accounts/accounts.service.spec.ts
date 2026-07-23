import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, ControlType, NormalBalance } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsService } from './accounts.service';
import { DEFAULT_CHART } from './account-defaults';
import { OFFICIAL_CHART_REST } from './official-chart';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('AccountsService', () => {
  let prisma: PrismaService;
  let service: AccountsService;
  let companyAId: string;
  let companyBId: string;
  let companyCId: string;
  let platformAdmin: AuthenticatedUser;
  let callerA: AuthenticatedUser;
  let callerB: AuthenticatedUser;
  let callerC: AuthenticatedUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [AccountsService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(AccountsService);

    const suffix = randomUUID();
    const [a, b, c] = await Promise.all([
      prisma.company.create({
        data: { name: 'Acc Co A', taxNumber: `ACC-A-${suffix}` },
      }),
      prisma.company.create({
        data: { name: 'Acc Co B', taxNumber: `ACC-B-${suffix}` },
      }),
      prisma.company.create({
        data: { name: 'Acc Co C', taxNumber: `ACC-C-${suffix}` },
      }),
    ]);
    companyAId = a.id;
    companyBId = b.id;
    companyCId = c.id;

    platformAdmin = { userId: 'admin', companyId: null };
    callerA = { userId: 'caller-a', companyId: companyAId };
    callerB = { userId: 'caller-b', companyId: companyBId };
    callerC = { userId: 'caller-c', companyId: companyCId };
  });

  afterAll(async () => {
    // parentId is an optional self-relation (ON DELETE SET NULL), so a single
    // deleteMany per company is safe.
    await prisma.account.deleteMany({
      where: { companyId: { in: [companyAId, companyBId, companyCId] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId, companyCId] } },
    });
    await prisma.$disconnect();
  });

  const base = (number: string) => ({
    number,
    name: `Account ${number}`,
    accountClass: 5,
    type: AccountType.ASSET,
    normalBalance: NormalBalance.DEBIT,
  });

  it('creates an account in the caller’s own company', async () => {
    const acc = await service.create(
      base(`A-${randomUUID().slice(0, 8)}`),
      callerA,
    );
    expect(acc.companyId).toBe(companyAId);
    expect(acc.isActive).toBe(true);
    expect(acc.isControl).toBe(false);
  });

  it("forces companyId to the caller's own company, overriding a submitted one", async () => {
    const acc = await service.create(
      { ...base(`OV-${randomUUID().slice(0, 8)}`), companyId: companyBId },
      callerA,
    );
    expect(acc.companyId).toBe(companyAId);
  });

  it('lets a platform admin target a company via companyId', async () => {
    const acc = await service.create(
      { ...base(`AD-${randomUUID().slice(0, 8)}`), companyId: companyBId },
      platformAdmin,
    );
    expect(acc.companyId).toBe(companyBId);
  });

  it('rejects a platform admin create with an unknown companyId (404)', async () => {
    await expect(
      service.create(
        { ...base(`X-${randomUUID().slice(0, 8)}`), companyId: randomUUID() },
        platformAdmin,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a duplicate account number within a company (409)', async () => {
    const number = `DUP-${randomUUID().slice(0, 8)}`;
    await service.create(base(number), callerA);
    await expect(service.create(base(number), callerA)).rejects.toThrow(
      ConflictException,
    );
  });

  it('allows the same number in a different company', async () => {
    const number = `SHARED-${randomUUID().slice(0, 8)}`;
    const inA = await service.create(base(number), callerA);
    const inB = await service.create(base(number), callerB);
    expect(inA.companyId).toBe(companyAId);
    expect(inB.companyId).toBe(companyBId);
  });

  it('validates the currency restriction (404 for unknown, ok for seeded USD)', async () => {
    await expect(
      service.create(
        {
          ...base(`CR-${randomUUID().slice(0, 8)}`),
          currencyRestriction: 'XZZ',
        },
        callerA,
      ),
    ).rejects.toThrow(NotFoundException);

    const acc = await service.create(
      { ...base(`CR-${randomUUID().slice(0, 8)}`), currencyRestriction: 'USD' },
      callerA,
    );
    expect(acc.currencyRestriction).toBe('USD');
  });

  it('enforces control-account flag/type consistency', async () => {
    await expect(
      service.create(
        { ...base(`CT-${randomUUID().slice(0, 8)}`), isControl: true },
        callerA,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create(
        {
          ...base(`CT-${randomUUID().slice(0, 8)}`),
          controlType: ControlType.AR,
        },
        callerA,
      ),
    ).rejects.toThrow(BadRequestException);

    const control = await service.create(
      {
        ...base(`CT-${randomUUID().slice(0, 8)}`),
        isControl: true,
        controlType: ControlType.CASH,
      },
      callerA,
    );
    expect(control.isControl).toBe(true);
    expect(control.controlType).toBe(ControlType.CASH);
  });

  it('validates the parent account (404 for unknown, ok for a real one)', async () => {
    await expect(
      service.create(
        { ...base(`P-${randomUUID().slice(0, 8)}`), parentId: randomUUID() },
        callerA,
      ),
    ).rejects.toThrow(NotFoundException);

    const parent = await service.create(
      base(`PAR-${randomUUID().slice(0, 8)}`),
      callerA,
    );
    const child = await service.create(
      { ...base(`CHI-${randomUUID().slice(0, 8)}`), parentId: parent.id },
      callerA,
    );
    expect(child.parentId).toBe(parent.id);
  });

  it("hides company A's account from company B", async () => {
    const acc = await service.create(
      base(`PRIV-${randomUUID().slice(0, 8)}`),
      callerA,
    );
    await expect(service.findOne(acc.id, callerB)).rejects.toThrow(
      NotFoundException,
    );
    const listB = await service.findAll(
      { page: 1, limit: 200, sortBy: 'number', sortOrder: 'asc' },
      callerB,
    );
    expect(listB.data.map((x) => x.id)).not.toContain(acc.id);
  });

  it('filters by numberPrefix (subtree and specific account)', async () => {
    const tok = `PFX${randomUUID().slice(0, 6)}`;
    await service.create({ ...base(`${tok}60`) }, callerB);
    await service.create({ ...base(`${tok}600`) }, callerB);
    await service.create({ ...base(`${tok}70`) }, callerB);

    const page = {
      page: 1,
      limit: 50,
      sortBy: 'number',
      sortOrder: 'asc' as const,
    };

    // subtree: everything under the "…6" branch
    const subtree = await service.findAll(
      { ...page, numberPrefix: [`${tok}6`] },
      callerB,
    );
    const subtreeNums = subtree.data.map((a) => a.number).sort();
    expect(subtreeNums).toEqual([`${tok}60`, `${tok}600`]);

    // specific: the full number returns that account (not its sibling "…60")
    const one = await service.findAll(
      { ...page, numberPrefix: [`${tok}600`] },
      callerB,
    );
    expect(one.data.map((a) => a.number)).toEqual([`${tok}600`]);
  });

  it('filters by multiple classes and multiple prefixes at once', async () => {
    const tok = `MUL${randomUUID().slice(0, 6)}`;
    await service.create(
      {
        ...base(`${tok}60`),
        accountClass: 6,
        type: AccountType.EXPENSE,
        normalBalance: NormalBalance.DEBIT,
      },
      callerB,
    );
    await service.create(
      {
        ...base(`${tok}70`),
        accountClass: 7,
        type: AccountType.REVENUE,
        normalBalance: NormalBalance.CREDIT,
      },
      callerB,
    );
    await service.create({ ...base(`${tok}50`), accountClass: 5 }, callerB);

    const page = {
      page: 1,
      limit: 50,
      sortBy: 'number',
      sortOrder: 'asc' as const,
    };

    // multiple classes: only 6 and 7 (the class-5 one is excluded), scoped to
    // this test's accounts via the shared token prefix.
    const byClass = await service.findAll(
      { ...page, accountClass: [6, 7], numberPrefix: [tok] },
      callerB,
    );
    expect(byClass.data.map((a) => a.number).sort()).toEqual([
      `${tok}60`,
      `${tok}70`,
    ]);

    // multiple prefixes: the "…5" and "…6" subtrees, not "…7"
    const byPrefix = await service.findAll(
      { ...page, numberPrefix: [`${tok}5`, `${tok}6`] },
      callerB,
    );
    expect(byPrefix.data.map((a) => a.number).sort()).toEqual([
      `${tok}50`,
      `${tok}60`,
    ]);
  });

  it('re-parents on update and rejects cycles', async () => {
    const p = await service.create(
      base(`CY-P-${randomUUID().slice(0, 8)}`),
      callerA,
    );
    const c = await service.create(
      { ...base(`CY-C-${randomUUID().slice(0, 8)}`), parentId: p.id },
      callerA,
    );

    // self-parenting
    await expect(
      service.update(c.id, { parentId: c.id }, callerA),
    ).rejects.toThrow(BadRequestException);
    // making a node a child of its own descendant
    await expect(
      service.update(p.id, { parentId: c.id }, callerA),
    ).rejects.toThrow(BadRequestException);

    // a legitimate re-parent works
    const other = await service.create(
      base(`CY-O-${randomUUID().slice(0, 8)}`),
      callerA,
    );
    const moved = await service.update(c.id, { parentId: other.id }, callerA);
    expect(moved.parentId).toBe(other.id);
  });

  it('blocks deleting an account with children, then soft-deletes a leaf', async () => {
    const parent = await service.create(
      base(`DP-${randomUUID().slice(0, 8)}`),
      callerA,
    );
    const child = await service.create(
      { ...base(`DC-${randomUUID().slice(0, 8)}`), parentId: parent.id },
      callerA,
    );

    await expect(service.remove(parent.id, callerA)).rejects.toThrow(
      ConflictException,
    );

    await service.remove(child.id, callerA);
    await expect(service.findOne(child.id, callerA)).rejects.toThrow(
      NotFoundException,
    );
    const row = await prisma.account.findUnique({ where: { id: child.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it('builds a nested tree', async () => {
    const root = await service.create(
      base(`T-R-${randomUUID().slice(0, 8)}`),
      callerC,
    );
    const child = await service.create(
      { ...base(`T-C-${randomUUID().slice(0, 8)}`), parentId: root.id },
      callerC,
    );

    const tree = await service.findTree(callerC);
    const rootNode = tree.find((n) => n.id === root.id);
    expect(rootNode).toBeDefined();
    expect(rootNode?.children.map((c) => c.id)).toContain(child.id);
  });

  it('seeds the default chart and is idempotent', async () => {
    const created = await service.seedDefault(callerC);
    expect(created.length).toBe(DEFAULT_CHART.length);

    // control accounts came through with their flags (official PCL numbers)
    const ar = created.find((a) => a.number === '41');
    expect(ar?.isControl).toBe(true);
    expect(ar?.controlType).toBe(ControlType.AR);
    const outVat = created.find((a) => a.number === '4427');
    expect(outVat?.controlType).toBe(ControlType.VAT_OUT);
    // nesting resolved by number: 4427's parent is 442
    const vatParent = created.find((a) => a.number === '442');
    expect(outVat?.parentId).toBe(vatParent?.id);

    // second run creates nothing
    const again = await service.seedDefault(callerC);
    expect(again.length).toBe(0);
  });

  it('rejects seedDefault for a platform admin (no company to seed)', async () => {
    await expect(service.seedDefault(platformAdmin)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('imports the full official chart once, then blocks a second import', async () => {
    // companyC already has the common subset seeded above.
    const commonCount = await prisma.account.count({
      where: { companyId: companyCId, deletedAt: null },
    });

    const result = await service.importOfficialChart(callerC);
    expect(result.imported).toBe(OFFICIAL_CHART_REST.length);

    // common + rest together make up the full official chart (759 accounts),
    // plus any ad-hoc accounts created earlier in this suite for companyC.
    const totalCount = await prisma.account.count({
      where: { companyId: companyCId, deletedAt: null },
    });
    expect(totalCount).toBe(commonCount + OFFICIAL_CHART_REST.length);

    // a REST account resolved its parent against an already-seeded common one
    const supplierChild = await prisma.account.findFirst({
      where: { companyId: companyCId, number: '4011' },
    });
    const supplierParent = await prisma.account.findFirst({
      where: { companyId: companyCId, number: '401' },
    });
    expect(supplierChild?.parentId).toBe(supplierParent?.id);

    // second import is blocked
    await expect(service.importOfficialChart(callerC)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects importOfficialChart for a platform admin', async () => {
    await expect(service.importOfficialChart(platformAdmin)).rejects.toThrow(
      BadRequestException,
    );
  });
});
