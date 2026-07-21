import { randomUUID } from 'crypto';
import { PrismaClient, Prisma, DocumentType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { DEFAULT_CHART } from '../src/modules/accounts/account-defaults';
import { OFFICIAL_CHART_REST } from '../src/modules/accounts/official-chart';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const BCRYPT_SALT_ROUNDS = 12;

// Ready-to-use demo tenants: each is a company with the FULL official chart of
// accounts (common subset + the rest = every account), a default VAT rate and
// document sequences, plus an admin/owner and a member — so the app has real,
// operable data on a fresh database. All seeding below is idempotent —
// re-running never duplicates.
const DEMO_TENANTS = [
  {
    company: {
      name: 'Demo Company',
      taxNumber: 'DEMO-0001',
      phone: '+961 1 000 000',
      email: 'info@demo.example.com',
    },
    users: [
      {
        email: 'owner@demo.example.com',
        password: process.env.DEMO_OWNER_PASSWORD ?? 'Owner@12345',
        firstName: 'Demo',
        lastName: 'Owner',
        roleName: 'Company Admin',
      },
      {
        email: 'member@demo.example.com',
        password: process.env.DEMO_MEMBER_PASSWORD ?? 'Member@12345',
        firstName: 'Demo',
        lastName: 'Member',
        roleName: 'Company Member',
      },
    ],
  },
  {
    company: {
      name: 'Second Company',
      taxNumber: 'DEMO-0002',
      phone: '+961 1 000 002',
      email: 'info@second.example.com',
    },
    users: [
      {
        email: 'owner2@demo.example.com',
        password: process.env.DEMO_OWNER2_PASSWORD ?? 'Owner@12345',
        firstName: 'Second',
        lastName: 'Owner',
        roleName: 'Company Admin',
      },
      {
        email: 'member2@demo.example.com',
        password: process.env.DEMO_MEMBER2_PASSWORD ?? 'Member@12345',
        firstName: 'Second',
        lastName: 'Member',
        roleName: 'Company Member',
      },
    ],
  },
] as const;

// A platform-admin/support user has NO company (companyId null) — CASL grants
// it `manage all` and PlatformAdminGuard lets it through the admin-only routes.
// Seeded so the admin-scoped APIs are reachable on a fresh database; override
// the credentials via env in any non-local environment.
const PLATFORM_ADMIN = {
  email: process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.PLATFORM_ADMIN_PASSWORD ?? 'Admin@12345',
  firstName: 'Platform',
  lastName: 'Admin',
};

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
  { key: 'account.read', subject: 'Account', action: 'read', description: 'View chart of accounts' },
  { key: 'account.create', subject: 'Account', action: 'create', description: 'Create accounts' },
  { key: 'account.update', subject: 'Account', action: 'update', description: 'Update accounts' },
  { key: 'account.delete', subject: 'Account', action: 'delete', description: 'Delete accounts' },
  { key: 'tax.read', subject: 'TaxRate', action: 'read', description: 'View tax rates' },
  { key: 'tax.create', subject: 'TaxRate', action: 'create', description: 'Create tax rates' },
  { key: 'tax.update', subject: 'TaxRate', action: 'update', description: 'Update tax rates' },
  { key: 'tax.delete', subject: 'TaxRate', action: 'delete', description: 'Delete tax rates' },
  { key: 'sequence.read', subject: 'DocumentSequence', action: 'read', description: 'View document sequences' },
  { key: 'sequence.create', subject: 'DocumentSequence', action: 'create', description: 'Create document sequences' },
  { key: 'sequence.update', subject: 'DocumentSequence', action: 'update', description: 'Update document sequences' },
  { key: 'sequence.delete', subject: 'DocumentSequence', action: 'delete', description: 'Delete document sequences' },
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
      'account.read',
      'tax.read',
      'sequence.read',
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

  const existingAdmin = await prisma.user.findUnique({
    where: { email: PLATFORM_ADMIN.email },
  });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        firstName: PLATFORM_ADMIN.firstName,
        lastName: PLATFORM_ADMIN.lastName,
        email: PLATFORM_ADMIN.email,
        passwordHash: await bcrypt.hash(
          PLATFORM_ADMIN.password,
          BCRYPT_SALT_ROUNDS,
        ),
        companyId: null,
      },
    });
  }

  // --- Demo tenants: each = company + full chart + VAT + sequences + owner/member ---
  for (const tenant of DEMO_TENANTS) {
    let company = await prisma.company.findFirst({
      where: { taxNumber: tenant.company.taxNumber },
    });
    if (!company) {
      company = await prisma.company.create({ data: tenant.company });
    }

    await seedFullChart(company.id);
    await seedDefaultVatRate(company.id);
    await seedDefaultSequences(company.id);

    for (const demoUser of tenant.users) {
      let user = await prisma.user.findUnique({
        where: { email: demoUser.email },
      });
      if (!user) {
        user = await prisma.user.create({
          data: {
            firstName: demoUser.firstName,
            lastName: demoUser.lastName,
            email: demoUser.email,
            passwordHash: await bcrypt.hash(
              demoUser.password,
              BCRYPT_SALT_ROUNDS,
            ),
            companyId: company.id,
          },
        });
      }
      const role = await prisma.role.findFirst({
        where: { name: demoUser.roleName, isSystem: true, companyId: null },
      });
      if (role) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          update: {},
          create: { userId: user.id, roleId: role.id },
        });
      }
    }
  }

  const demoUserEmails = DEMO_TENANTS.flatMap((t) =>
    t.users.map((u) => u.email),
  );
  console.log(
    `Seeded ${PERMISSIONS.length} permissions, ${CURRENCIES.length} currencies, ${ROLES.length} roles, and 1 platform-admin user (${PLATFORM_ADMIN.email}).`,
  );
  console.log(
    `Demo tenants: ${DEMO_TENANTS.map((t) => t.company.name).join(', ')} — users ${demoUserEmails.join(', ')}.`,
  );
}

/**
 * Insert the full official chart of accounts (common subset + the rest = every
 * account) for a company. Idempotent: numbers that already exist are skipped.
 * Ids are generated up front so each account's parent resolves by number in a
 * single createMany. Returns how many accounts were created this run.
 */
async function seedFullChart(companyId: string): Promise<number> {
  const seeds = [...DEFAULT_CHART, ...OFFICIAL_CHART_REST];
  const existing = await prisma.account.findMany({
    where: { companyId },
    select: { number: true, id: true },
  });
  const idByNumber = new Map<string, string>(
    existing.map((a) => [a.number, a.id]),
  );
  const toCreate = seeds.filter((s) => !idByNumber.has(s.number));
  if (toCreate.length === 0) {
    return 0;
  }
  for (const seed of toCreate) {
    idByNumber.set(seed.number, randomUUID());
  }
  const rows: Prisma.AccountCreateManyInput[] = toCreate.map((seed) => ({
    id: idByNumber.get(seed.number),
    companyId,
    number: seed.number,
    name: seed.name,
    nameAr: seed.nameAr,
    nameFr: seed.nameFr,
    nameEn: seed.nameEn,
    accountClass: seed.accountClass,
    type: seed.type,
    normalBalance: seed.normalBalance,
    parentId: seed.parentNumber
      ? (idByNumber.get(seed.parentNumber) ?? null)
      : null,
    isControl: seed.isControl ?? false,
    controlType: seed.controlType ?? null,
  }));
  await prisma.account.createMany({ data: rows });
  return rows.length;
}

/**
 * Seed a company's default standard VAT rate (FR-105, 11%), wired to its
 * VAT_OUT / VAT_IN control accounts. Idempotent — a no-op if a standard rate
 * already exists. Mirrors TaxesService.applyDefaultVatRate for seed use.
 */
async function seedDefaultVatRate(companyId: string): Promise<void> {
  const existing = await prisma.taxRate.findFirst({
    where: { companyId, treatment: 'STANDARD' },
  });
  if (existing) {
    return;
  }
  const [vatOut, vatIn] = await Promise.all([
    prisma.account.findFirst({ where: { companyId, controlType: 'VAT_OUT' } }),
    prisma.account.findFirst({ where: { companyId, controlType: 'VAT_IN' } }),
  ]);
  await prisma.taxRate.create({
    data: {
      companyId,
      name: 'Standard VAT 11%',
      ratePct: 11,
      treatment: 'STANDARD',
      effectiveDate: new Date('2020-01-01T00:00:00.000Z'),
      vatOutAccountId: vatOut?.id ?? null,
      vatInAccountId: vatIn?.id ?? null,
    },
  });
}

/**
 * Seed a company's default document-numbering series (FR-106). Idempotent —
 * skips a docType that already has a company-wide series. Mirrors
 * SequencesService.applyDefaultSequences for seed use.
 */
async function seedDefaultSequences(companyId: string): Promise<void> {
  const defaults: { docType: DocumentType; prefix: string }[] = [
    { docType: 'SALES_INVOICE', prefix: 'INV-' },
    { docType: 'SALES_ORDER', prefix: 'SO-' },
    { docType: 'QUOTATION', prefix: 'QUO-' },
    { docType: 'DELIVERY_NOTE', prefix: 'DN-' },
    { docType: 'CREDIT_NOTE', prefix: 'CN-' },
    { docType: 'PURCHASE_ORDER', prefix: 'PO-' },
    { docType: 'PAYMENT_RECEIPT', prefix: 'REC-' },
    { docType: 'JOURNAL_ENTRY', prefix: 'JE-' },
  ];
  const existing = await prisma.documentSequence.findMany({
    where: { companyId, branchId: null },
    select: { docType: true },
  });
  const have = new Set(existing.map((e) => e.docType));
  const toCreate = defaults.filter((s) => !have.has(s.docType));
  if (toCreate.length === 0) {
    return;
  }
  await prisma.documentSequence.createMany({
    data: toCreate.map((s) => ({
      companyId,
      docType: s.docType,
      prefix: s.prefix,
      resetPeriod: 'YEARLY',
      padWidth: 4,
      nextNumber: 1,
    })),
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
