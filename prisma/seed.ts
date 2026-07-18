import { PrismaClient } from '@prisma/client';
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
  { key: 'role.create', subject: 'Role', action: 'create', description: 'Create roles' },
  { key: 'role.update', subject: 'Role', action: 'update', description: 'Update roles' },
  { key: 'role.delete', subject: 'Role', action: 'delete', description: 'Delete roles' },
  { key: 'branch.read', subject: 'Branch', action: 'read', description: 'View branches' },
  { key: 'branch.create', subject: 'Branch', action: 'create', description: 'Create branches' },
  { key: 'branch.update', subject: 'Branch', action: 'update', description: 'Update branches' },
  { key: 'branch.delete', subject: 'Branch', action: 'delete', description: 'Delete branches' },
  { key: 'currency.read', subject: 'Currency', action: 'read', description: 'View currencies' },
  { key: 'currency.create', subject: 'Currency', action: 'create', description: 'Create currencies' },
  { key: 'currency.update', subject: 'Currency', action: 'update', description: 'Update currencies' },
  { key: 'currency.delete', subject: 'Currency', action: 'delete', description: 'Delete currencies' },
  { key: 'exchangeRate.read', subject: 'ExchangeRate', action: 'read', description: 'View exchange rates' },
  { key: 'exchangeRate.create', subject: 'ExchangeRate', action: 'create', description: 'Create exchange rates' },
  { key: 'exchangeRate.update', subject: 'ExchangeRate', action: 'update', description: 'Update exchange rates' },
  { key: 'exchangeRate.delete', subject: 'ExchangeRate', action: 'delete', description: 'Delete exchange rates' },
] as const;

// Global reference currencies (FR-103) — shared by every tenant. USD is the
// base currency for both tenants (2 decimals); LBP carries 0 decimals.
const CURRENCIES = [
  {
    code: 'USD',
    name: 'US Dollar',
    nameAr: 'دولار أمريكي',
    nameFr: 'Dollar américain',
    nameEn: 'US Dollar',
    symbol: '$',
    decimalPlaces: 2,
  },
  {
    code: 'LBP',
    name: 'Lebanese Pound',
    nameAr: 'ليرة لبنانية',
    nameFr: 'Livre libanaise',
    nameEn: 'Lebanese Pound',
    symbol: 'ل.ل',
    decimalPlaces: 0,
  },
] as const;

// Both seeded roles are global (companyId: null) and isSystem (protected
// from update/delete via the API — AuthService and UsersService look them
// up by name and would break if they moved).
const ROLES: { name: string; description: string; permissionKeys: string[] }[] = [
  {
    name: 'Company Admin',
    description: "Full administrative access within the company's own data.",
    permissionKeys: PERMISSIONS.map((p) => p.key),
  },
  {
    name: 'Company Member',
    description: 'Baseline access for a company teammate.',
    permissionKeys: [
      'company.read',
      'role.read',
      'branch.read',
      'currency.read',
      'exchangeRate.read',
    ],
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

  for (const currency of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {
        name: currency.name,
        nameAr: currency.nameAr,
        nameFr: currency.nameFr,
        nameEn: currency.nameEn,
        symbol: currency.symbol,
        decimalPlaces: currency.decimalPlaces,
      },
      create: currency,
    });
  }

  for (const role of ROLES) {
    // Prisma's compound-unique-key type for [companyId, name] doesn't accept
    // null for companyId (a generated-type limitation on nullable columns
    // in compound unique constraints), so upsert-by-compound-key isn't
    // available here — find-then-create/update instead.
    const existingRole = await prisma.role.findFirst({
      where: { companyId: null, name: role.name },
    });
    const savedRole = existingRole
      ? await prisma.role.update({
          where: { id: existingRole.id },
          data: { description: role.description, isSystem: true },
        })
      : await prisma.role.create({
          data: {
            name: role.name,
            description: role.description,
            isSystem: true,
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

  console.log(
    `Seeded ${PERMISSIONS.length} permissions, ${CURRENCIES.length} currencies, and ${ROLES.length} roles.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
