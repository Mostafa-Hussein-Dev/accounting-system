import { PrismaClient, RoleScope } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PERMISSIONS = [
  { key: 'user.create', subject: 'User', action: 'create', description: 'Create users' },
  { key: 'user.read', subject: 'User', action: 'read', description: 'View users' },
  { key: 'user.update', subject: 'User', action: 'update', description: 'Update users' },
  { key: 'user.delete', subject: 'User', action: 'delete', description: 'Delete users' },
  { key: 'company.read', subject: 'Company', action: 'read', description: 'View a company' },
  { key: 'company.update', subject: 'Company', action: 'update', description: 'Update a company' },
  { key: 'company.delete', subject: 'Company', action: 'delete', description: 'Delete a company' },
  { key: 'role.read', subject: 'Role', action: 'read', description: 'View roles' },
] as const;

const ROLES: { name: string; description: string; scope: RoleScope; permissionKeys: string[] }[] = [
  {
    name: 'Company Admin',
    description: "Full administrative access within the company's own data.",
    scope: RoleScope.COMPANY,
    permissionKeys: PERMISSIONS.map((p) => p.key),
  },
  {
    name: 'Company Member',
    description: 'Baseline access for a company teammate.',
    scope: RoleScope.COMPANY,
    permissionKeys: ['company.read', 'role.read'],
  },
];

async function main() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        subject: permission.subject,
        action: permission.action,
        description: permission.description,
      },
      create: permission,
    });
  }

  for (const role of ROLES) {
    const savedRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, scope: role.scope },
      create: {
        name: role.name,
        description: role.description,
        scope: role.scope,
      },
    });

    const permissions = await prisma.permission.findMany({
      where: { key: { in: role.permissionKeys } },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: savedRole.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: savedRole.id, permissionId: permission.id },
      });
    }
  }

  console.log(`Seeded ${PERMISSIONS.length} permissions and ${ROLES.length} roles.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
