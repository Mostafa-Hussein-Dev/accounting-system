import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AccountType,
  ControlType,
  NormalBalance,
  TaxTreatment,
} from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxesService } from './taxes.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('TaxesService', () => {
  let prisma: PrismaService;
  let service: TaxesService;
  let companyAId: string;
  let companyBId: string;
  let companyCId: string;
  let vatOutA: string;
  let vatInA: string;
  let plainA: string;
  let vatOutC: string;
  let vatInC: string;
  const createdRateIds: string[] = [];
  let platformAdmin: AuthenticatedUser;
  let callerA: AuthenticatedUser;
  let callerB: AuthenticatedUser;

  const control = (companyId: string, number: string, ct: ControlType) =>
    prisma.account.create({
      data: {
        companyId,
        number,
        name: `Acc ${number}`,
        accountClass: 4,
        type:
          ct === ControlType.VAT_IN ? AccountType.ASSET : AccountType.LIABILITY,
        normalBalance:
          ct === ControlType.VAT_IN
            ? NormalBalance.DEBIT
            : NormalBalance.CREDIT,
        isControl: true,
        controlType: ct,
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [TaxesService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(TaxesService);

    const suffix = randomUUID();
    const [a, b, c] = await Promise.all([
      prisma.company.create({
        data: { name: 'Tax A', taxNumber: `TAX-A-${suffix}` },
      }),
      prisma.company.create({
        data: { name: 'Tax B', taxNumber: `TAX-B-${suffix}` },
      }),
      prisma.company.create({
        data: { name: 'Tax C', taxNumber: `TAX-C-${suffix}` },
      }),
    ]);
    companyAId = a.id;
    companyBId = b.id;
    companyCId = c.id;

    const [vo, vi, pl, voC, viC] = await Promise.all([
      control(companyAId, '4427', ControlType.VAT_OUT),
      control(companyAId, '4426', ControlType.VAT_IN),
      prisma.account.create({
        data: {
          companyId: companyAId,
          number: '600',
          name: 'Purchases',
          accountClass: 6,
          type: AccountType.EXPENSE,
          normalBalance: NormalBalance.DEBIT,
        },
      }),
      control(companyCId, '4427', ControlType.VAT_OUT),
      control(companyCId, '4426', ControlType.VAT_IN),
    ]);
    vatOutA = vo.id;
    vatInA = vi.id;
    plainA = pl.id;
    vatOutC = voC.id;
    vatInC = viC.id;

    platformAdmin = { userId: 'admin', companyId: null };
    callerA = { userId: 'caller-a', companyId: companyAId };
    callerB = { userId: 'caller-b', companyId: companyBId };
  });

  afterAll(async () => {
    await prisma.taxRate.deleteMany({ where: { id: { in: createdRateIds } } });
    await prisma.taxRate.deleteMany({
      where: { companyId: { in: [companyAId, companyBId, companyCId] } },
    });
    await prisma.account.deleteMany({
      where: { companyId: { in: [companyAId, companyBId, companyCId] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId, companyCId] } },
    });
    await prisma.$disconnect();
  });

  const standard = (over: Partial<Record<string, unknown>> = {}) => ({
    name: 'Standard VAT 11%',
    ratePct: 11,
    treatment: TaxTreatment.STANDARD,
    effectiveDate: '2026-01-01',
    vatOutAccountId: vatOutA,
    vatInAccountId: vatInA,
    ...over,
  });

  it('creates a standard rate in the caller’s own company', async () => {
    const rate = await service.create(standard(), callerA);
    createdRateIds.push(rate.id);
    expect(rate.companyId).toBe(companyAId);
    expect(rate.ratePct).toBe(11);
    expect(rate.treatment).toBe(TaxTreatment.STANDARD);
  });

  it("forces companyId to the caller's own company", async () => {
    const rate = await service.create(
      standard({ companyId: companyBId }),
      callerA,
    );
    createdRateIds.push(rate.id);
    expect(rate.companyId).toBe(companyAId);
  });

  it('lets a platform admin target a company, but requires companyId', async () => {
    const rate = await service.create(
      {
        ...standard(),
        companyId: companyCId,
        vatOutAccountId: vatOutC,
        vatInAccountId: vatInC,
      },
      platformAdmin,
    );
    createdRateIds.push(rate.id);
    expect(rate.companyId).toBe(companyCId);

    await expect(
      service.create(standard({ companyId: undefined }), platformAdmin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a standard rate missing VAT accounts (400)', async () => {
    await expect(
      service.create(
        standard({ vatOutAccountId: undefined, vatInAccountId: undefined }),
        callerA,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a standard rate mapped to a non-VAT account (400)', async () => {
    await expect(
      service.create(standard({ vatOutAccountId: plainA }), callerA),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects mapping another company's account", async () => {
    await expect(
      service.create(standard({ vatOutAccountId: vatOutC }), callerA),
    ).rejects.toThrow(NotFoundException);
  });

  it('enforces zero/exempt rules (rate must be 0, no accounts)', async () => {
    await expect(
      service.create(
        standard({
          treatment: TaxTreatment.ZERO,
          ratePct: 5,
          vatOutAccountId: undefined,
          vatInAccountId: undefined,
        }),
        callerA,
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create(
        standard({ treatment: TaxTreatment.EXEMPT, ratePct: 0 }),
        callerA,
      ),
    ).rejects.toThrow(BadRequestException); // accounts not allowed

    const zero = await service.create(
      {
        name: 'Zero-rated',
        ratePct: 0,
        treatment: TaxTreatment.ZERO,
        effectiveDate: '2026-01-01',
      },
      callerA,
    );
    createdRateIds.push(zero.id);
    expect(zero.ratePct).toBe(0);
    expect(zero.vatOutAccountId).toBeNull();
  });

  it("hides company A's rate from company B", async () => {
    const rate = await service.create(standard({ name: 'Private A' }), callerA);
    createdRateIds.push(rate.id);
    await expect(service.findOne(rate.id, callerB)).rejects.toThrow(
      NotFoundException,
    );
    const listB = await service.findAll(
      { page: 1, limit: 100, sortBy: 'effectiveDate', sortOrder: 'desc' },
      callerB,
    );
    expect(listB.data.map((r) => r.id)).not.toContain(rate.id);
  });

  it('resolves the rate in force on a date (newest <= date)', async () => {
    const older = await service.create(
      standard({
        name: 'VAT 10% (2024)',
        ratePct: 10,
        effectiveDate: '2024-01-01',
      }),
      callerA,
    );
    const newer = await service.create(
      standard({
        name: 'VAT 11% (2026)',
        ratePct: 11,
        effectiveDate: '2026-01-01',
      }),
      callerA,
    );
    createdRateIds.push(older.id, newer.id);

    const on2025 = await service.findCurrent(
      { treatment: TaxTreatment.STANDARD, date: '2025-06-01' },
      callerA,
    );
    expect(on2025.ratePct).toBe(10);

    const on2026 = await service.findCurrent(
      { treatment: TaxTreatment.STANDARD, date: '2026-06-01' },
      callerA,
    );
    expect(on2026.ratePct).toBe(11);

    await expect(
      service.findCurrent(
        { treatment: TaxTreatment.STANDARD, date: '2000-01-01' },
        callerA,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('hard-deletes a rate', async () => {
    const rate = await service.create(standard({ name: 'Deletable' }), callerA);
    await service.remove(rate.id, callerA);
    await expect(service.findOne(rate.id, callerA)).rejects.toThrow(
      NotFoundException,
    );
    const row = await prisma.taxRate.findUnique({ where: { id: rate.id } });
    expect(row).toBeNull();
  });

  it('applyDefaultVatRate seeds an 11% standard rate wired to VAT accounts, idempotently', async () => {
    // fresh company D with VAT accounts, no rates yet
    const d = await prisma.company.create({
      data: { name: 'Tax D', taxNumber: `TAX-D-${randomUUID()}` },
    });
    await control(d.id, '4427', ControlType.VAT_OUT);
    await control(d.id, '4426', ControlType.VAT_IN);

    const created = await service.applyDefaultVatRate(d.id, prisma);
    expect(created).not.toBeNull();
    expect(Number(created?.ratePct)).toBe(11);
    expect(created?.vatOutAccountId).not.toBeNull();
    expect(created?.vatInAccountId).not.toBeNull();

    const again = await service.applyDefaultVatRate(d.id, prisma);
    expect(again).toBeNull();

    await prisma.taxRate.deleteMany({ where: { companyId: d.id } });
    await prisma.account.deleteMany({ where: { companyId: d.id } });
    await prisma.company.delete({ where: { id: d.id } });
  });
});
