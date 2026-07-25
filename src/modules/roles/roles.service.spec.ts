import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesService } from './roles.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('RolesService', () => {
  let prisma: PrismaService;
  let service: RolesService;
  let companyAId: string;
  let companyBId: string;
  let permissionId: string;
  const createdRoleIds: string[] = [];
  let platformAdmin: AuthenticatedUser;
  let callerA: AuthenticatedUser;
  let callerB: AuthenticatedUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [RolesService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(RolesService);

    const suffix = randomUUID();
    const companyA = await prisma.company.create({
      data: { name: 'Roles Test Co A', taxNumber: `ROLES-TEST-A-${suffix}` },
    });
    const companyB = await prisma.company.create({
      data: { name: 'Roles Test Co B', taxNumber: `ROLES-TEST-B-${suffix}` },
    });
    companyAId = companyA.id;
    companyBId = companyB.id;

    const permission = await prisma.permission.findFirstOrThrow({
      where: { key: 'company.read' },
    });
    permissionId = permission.id;

    platformAdmin = { userId: 'admin', companyId: null, isPlatformAdmin: true, mustChangePassword: false };
    callerA = {
      userId: 'caller-a',
      companyId: companyAId,
      isPlatformAdmin: false, mustChangePassword: false,
    };
    callerB = {
      userId: 'caller-b',
      companyId: companyBId,
      isPlatformAdmin: false, mustChangePassword: false,
    };
  });

  afterAll(async () => {
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId] } },
    });
    await prisma.$disconnect();
  });

  it('lets a platform admin create a global role (no companyId)', async () => {
    const suffix = randomUUID();
    const role = await service.create(
      { name: `Global Role ${suffix}`, permissionIds: [permissionId] },
      platformAdmin,
    );
    createdRoleIds.push(role.id);
    expect(role.companyId).toBeNull();
    expect(role.isSystem).toBe(false);
  });

  it("forces companyId to the caller's own company for a company-scoped caller", async () => {
    const suffix = randomUUID();
    const role = await service.create(
      {
        name: `Manager ${suffix}`,
        permissionIds: [permissionId],
        companyId: companyBId, // attempt to target another company
      },
      callerA,
    );
    createdRoleIds.push(role.id);
    expect(role.companyId).toBe(companyAId);
  });

  it('allows two different companies to each create a role with the same name', async () => {
    const name = `Duplicate Name ${randomUUID()}`;
    const roleA = await service.create(
      { name, permissionIds: [permissionId] },
      callerA,
    );
    const roleB = await service.create(
      { name, permissionIds: [permissionId] },
      callerB,
    );
    createdRoleIds.push(roleA.id, roleB.id);
    expect(roleA.companyId).toBe(companyAId);
    expect(roleB.companyId).toBe(companyBId);
  });

  it('rejects two global roles sharing the same name', async () => {
    const name = `Global Duplicate ${randomUUID()}`;
    const first = await service.create(
      { name, permissionIds: [permissionId] },
      platformAdmin,
    );
    createdRoleIds.push(first.id);
    await expect(
      service.create({ name, permissionIds: [permissionId] }, platformAdmin),
    ).rejects.toThrow(ConflictException);
  });

  it("hides company A's custom role from company B, and blocks B from updating/deleting it", async () => {
    const role = await service.create(
      { name: `Private A ${randomUUID()}`, permissionIds: [permissionId] },
      callerA,
    );
    createdRoleIds.push(role.id);

    const listAsB = await service.findAll(callerB);
    expect(listAsB.map((r) => r.id)).not.toContain(role.id);

    await expect(
      service.update(role.id, { description: 'hacked' }, callerB),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.remove(role.id, callerB)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets a company update its own custom role', async () => {
    const role = await service.create(
      { name: `Editable ${randomUUID()}`, permissionIds: [permissionId] },
      callerA,
    );
    createdRoleIds.push(role.id);

    const updated = await service.update(
      role.id,
      { description: 'updated description' },
      callerA,
    );
    expect(updated.description).toBe('updated description');
  });

  it('protects system roles from update and delete, even for a platform admin', async () => {
    const systemRole = await prisma.role.findFirstOrThrow({
      where: { name: 'Company Member', isSystem: true },
    });

    await expect(
      service.update(systemRole.id, { description: 'nope' }, platformAdmin),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.remove(systemRole.id, platformAdmin)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('blocks deleting a role currently assigned to a user', async () => {
    const role = await service.create(
      { name: `In Use ${randomUUID()}`, permissionIds: [permissionId] },
      callerA,
    );
    createdRoleIds.push(role.id);

    const user = await prisma.user.create({
      data: {
        firstName: 'InUse',
        lastName: 'Tester',
        email: `roles-inuse-${randomUUID()}@example.com`,
        passwordHash: 'irrelevant',
      },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id, companyId: companyAId },
    });

    await expect(service.remove(role.id, callerA)).rejects.toThrow(
      ConflictException,
    );

    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects an unknown permissionId with a clear 404', async () => {
    await expect(
      service.create(
        { name: `Bad Perm ${randomUUID()}`, permissionIds: [randomUUID()] },
        callerA,
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
