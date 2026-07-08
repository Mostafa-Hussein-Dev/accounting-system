import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CaslAbilityFactory } from './casl-ability.factory';

describe('CaslAbilityFactory', () => {
  let prisma: PrismaService;
  let factory: CaslAbilityFactory;
  let companyId: string;
  let memberUserId: string;
  let unionUserId: string;
  let extraRoleId: string;
  let extraPermissionId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [CaslAbilityFactory],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    factory = moduleRef.get(CaslAbilityFactory);

    const suffix = randomUUID();
    const company = await prisma.company.create({
      data: { name: 'Casl Test Co', taxNumber: `CASL-TEST-${suffix}` },
    });
    companyId = company.id;

    const memberRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'Company Member' },
    });

    const memberUser = await prisma.user.create({
      data: {
        firstName: 'Member',
        lastName: 'Tester',
        email: `casl-member-${suffix}@example.com`,
        passwordHash: 'irrelevant',
        companyId,
      },
    });
    memberUserId = memberUser.id;
    await prisma.userRole.create({
      data: { userId: memberUserId, roleId: memberRole.id },
    });

    // A second, disjoint permission/role not in the seed catalog, to prove
    // the factory unions permissions across ALL of a user's roles rather
    // than only reflecting the last-assigned one.
    const extraPermission = await prisma.permission.create({
      data: {
        key: `casl-test.extra-${suffix}`,
        subject: 'User',
        action: 'update',
        description: 'Test-only permission for union verification',
      },
    });
    extraPermissionId = extraPermission.id;
    const extraRole = await prisma.role.create({
      data: { name: `Casl Test Extra Role ${suffix}` },
    });
    extraRoleId = extraRole.id;
    await prisma.rolePermission.create({
      data: { roleId: extraRoleId, permissionId: extraPermissionId },
    });

    const unionUser = await prisma.user.create({
      data: {
        firstName: 'Union',
        lastName: 'Tester',
        email: `casl-union-${suffix}@example.com`,
        passwordHash: 'irrelevant',
        companyId,
      },
    });
    unionUserId = unionUser.id;
    await prisma.userRole.createMany({
      data: [
        { userId: unionUserId, roleId: memberRole.id },
        { userId: unionUserId, roleId: extraRoleId },
      ],
    });
  });

  afterAll(async () => {
    await prisma.userRole.deleteMany({
      where: { userId: { in: [memberUserId, unionUserId] } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: extraRoleId } });
    await prisma.role.delete({ where: { id: extraRoleId } });
    await prisma.permission.delete({ where: { id: extraPermissionId } });
    await prisma.user.deleteMany({
      where: { id: { in: [memberUserId, unionUserId] } },
    });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('grants a platform admin (companyId null) manage-all without any DB-backed role', async () => {
    const ability = await factory.createForUser({
      userId: 'no-such-user',
      companyId: null,
    });
    expect(ability.can('delete', 'Company')).toBe(true);
    expect(ability.can('create', 'User')).toBe(true);
  });

  it('grants exactly the seeded Company Member permissions to a company-scoped user', async () => {
    const ability = await factory.createForUser({
      userId: memberUserId,
      companyId,
    });
    expect(ability.can('read', 'Company')).toBe(true);
    expect(ability.can('read', 'Role')).toBe(true);
    expect(ability.can('update', 'Company')).toBe(false);
    expect(ability.can('delete', 'Company')).toBe(false);
  });

  it("unions permissions across all of a user's roles", async () => {
    const ability = await factory.createForUser({
      userId: unionUserId,
      companyId,
    });
    // From Company Member:
    expect(ability.can('read', 'Company')).toBe(true);
    // From the second, disjoint test role — proves accumulation, not overwrite:
    expect(ability.can('update', 'User')).toBe(true);
    // Never granted to either role:
    expect(ability.can('delete', 'Company')).toBe(false);
  });
});
