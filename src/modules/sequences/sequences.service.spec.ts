import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DocumentType, ResetPeriod } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { SequencesService } from './sequences.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('SequencesService', () => {
  let prisma: PrismaService;
  let service: SequencesService;
  let companyAId: string;
  let companyBId: string;
  let platformAdmin: AuthenticatedUser;
  let callerA: AuthenticatedUser;
  let callerB: AuthenticatedUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [SequencesService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(SequencesService);

    const suffix = randomUUID();
    const [a, b] = await Promise.all([
      prisma.company.create({
        data: { name: 'Seq A', taxNumber: `SEQ-A-${suffix}` },
      }),
      prisma.company.create({
        data: { name: 'Seq B', taxNumber: `SEQ-B-${suffix}` },
      }),
    ]);
    companyAId = a.id;
    companyBId = b.id;

    platformAdmin = {
      userId: 'admin',
      companyId: null,
      isPlatformAdmin: true,
      mustChangePassword: false,
    };
    callerA = {
      userId: 'caller-a',
      companyId: companyAId,
      isPlatformAdmin: false,
      mustChangePassword: false,
    };
    callerB = {
      userId: 'caller-b',
      companyId: companyBId,
      isPlatformAdmin: false,
      mustChangePassword: false,
    };
  });

  afterAll(async () => {
    await prisma.documentSequence.deleteMany({
      where: { companyId: { in: [companyAId, companyBId] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyAId, companyBId] } },
    });
    await prisma.$disconnect();
  });

  it('creates a company-wide series and rejects a duplicate', async () => {
    const seq = await service.create(
      { docType: DocumentType.SALES_INVOICE, prefix: 'INV-' },
      callerA,
    );
    expect(seq.companyId).toBe(companyAId);
    expect(seq.resetPeriod).toBe(ResetPeriod.YEARLY);
    expect(seq.nextNumber).toBe(1);

    await expect(
      service.create({ docType: DocumentType.SALES_INVOICE }, callerA),
    ).rejects.toThrow(ConflictException);
  });

  it("forces companyId to the caller's own; platform admin must name one", async () => {
    const seq = await service.create(
      { docType: DocumentType.QUOTATION, companyId: companyBId },
      callerA,
    );
    expect(seq.companyId).toBe(companyAId);

    await expect(
      service.create({ docType: DocumentType.PURCHASE_ORDER }, platformAdmin),
    ).rejects.toThrow();
  });

  it('previews without consuming, and hands out numbers with year + padding', async () => {
    const seq = await service.create(
      { docType: DocumentType.CREDIT_NOTE, prefix: 'CN-', padWidth: 4 },
      callerA,
    );

    const preview = await service.preview(seq.id, callerA);
    const year = new Date().getUTCFullYear();
    expect(preview.number).toBe(`CN-${year}-0001`);

    // preview did not advance the counter
    const after = await service.findOne(seq.id, callerA);
    expect(after.nextNumber).toBe(1);

    const first = await prisma.$transaction((tx) =>
      service.nextNumber(
        companyAId,
        null,
        DocumentType.CREDIT_NOTE,
        new Date(`${year}-06-01`),
        tx,
      ),
    );
    expect(first).toBe(`CN-${year}-0001`);
    const second = await prisma.$transaction((tx) =>
      service.nextNumber(
        companyAId,
        null,
        DocumentType.CREDIT_NOTE,
        new Date(`${year}-06-02`),
        tx,
      ),
    );
    expect(second).toBe(`CN-${year}-0002`);
  });

  it('is gap-controlled under concurrency (N parallel calls → N distinct contiguous numbers)', async () => {
    await service.create(
      { docType: DocumentType.PAYMENT_RECEIPT, prefix: 'REC-' },
      callerA,
    );
    const N = 25;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        prisma.$transaction((tx) =>
          service.nextNumber(
            companyAId,
            null,
            DocumentType.PAYMENT_RECEIPT,
            new Date('2026-06-01'),
            tx,
          ),
        ),
      ),
    );
    const numbers = results
      .map((r) => Number(r.replace(/\D/g, '').slice(-4)))
      .sort((x, y) => x - y);
    expect(new Set(numbers).size).toBe(N); // no duplicates
    expect(numbers[0]).toBe(1);
    expect(numbers[N - 1]).toBe(N); // contiguous, no gaps
  });

  it('resets the counter when the document date crosses the period', async () => {
    await service.create(
      {
        docType: DocumentType.SALES_ORDER,
        prefix: 'SO-',
        resetPeriod: ResetPeriod.YEARLY,
      },
      callerA,
    );
    const a = await prisma.$transaction((tx) =>
      service.nextNumber(
        companyAId,
        null,
        DocumentType.SALES_ORDER,
        new Date('2025-12-31'),
        tx,
      ),
    );
    const b = await prisma.$transaction((tx) =>
      service.nextNumber(
        companyAId,
        null,
        DocumentType.SALES_ORDER,
        new Date('2025-12-31'),
        tx,
      ),
    );
    const c = await prisma.$transaction((tx) =>
      service.nextNumber(
        companyAId,
        null,
        DocumentType.SALES_ORDER,
        new Date('2026-01-01'),
        tx,
      ),
    );
    expect(a).toBe('SO-2025-0001');
    expect(b).toBe('SO-2025-0002');
    expect(c).toBe('SO-2026-0001'); // reset on the new year
  });

  it('falls back to the company-wide series when no branch series exists', async () => {
    // company A has a company-wide SALES_INVOICE series from the first test
    const n = await prisma.$transaction((tx) =>
      service.nextNumber(
        companyAId,
        randomUUID(), // a branchId with no branch-specific series
        DocumentType.SALES_INVOICE,
        new Date('2026-06-01'),
        tx,
      ),
    );
    expect(n).toMatch(/^INV-2026-\d{4}$/);
  });

  it('throws when no series is configured', async () => {
    await expect(
      prisma.$transaction((tx) =>
        service.nextNumber(
          companyBId,
          null,
          DocumentType.JOURNAL_ENTRY,
          new Date(),
          tx,
        ),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("hides company A's sequence from company B", async () => {
    const seq = await service.create(
      { docType: DocumentType.DELIVERY_NOTE, prefix: 'DN-' },
      callerA,
    );
    await expect(service.findOne(seq.id, callerB)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('applyDefaultSequences seeds the default set idempotently', async () => {
    const created = await service.applyDefaultSequences(companyBId, prisma);
    expect(created).toBe(11);
    const again = await service.applyDefaultSequences(companyBId, prisma);
    expect(again).toBe(0);
  });
});
