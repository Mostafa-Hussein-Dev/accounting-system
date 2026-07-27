import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { AuditAction } from '@prisma/client';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditService } from './audit.service';

// End-to-end against the real database (same style as gl.service.spec).
describe('AuditService (FR-1102)', () => {
  let prisma: PrismaService;
  let audit: AuditService;
  let companyA: string;
  let companyB: string;
  const userId = randomUUID();

  const callerFor = (
    companyId: string | null,
    admin = false,
  ): AuthenticatedUser => ({
    userId,
    companyId,
    isPlatformAdmin: admin,
    mustChangePassword: false,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [AuditService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    audit = moduleRef.get(AuditService);

    const a = await prisma.company.create({
      data: { name: `Audit Co A ${randomUUID().slice(0, 8)}` },
    });
    const b = await prisma.company.create({
      data: { name: `Audit Co B ${randomUUID().slice(0, 8)}` },
    });
    companyA = a.id;
    companyB = b.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { companyId: { in: [companyA, companyB] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [companyA, companyB] } },
    });
    // Close the pg pool so the Jest worker can exit cleanly when this DB-backed
    // suite shares a worker with another spec.
    await prisma.$disconnect();
  });

  it('writes a row and redacts secret fields in before/after', async () => {
    const postedAt = new Date('2026-07-27T12:00:00.000Z');
    await audit.record({
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: 'user-x',
      companyId: companyA,
      userId,
      after: {
        email: 'x@example.com',
        password: 'sup3rsecret',
        postedAt,
        nested: { refreshToken: 'abc', keep: 1 },
      },
    });

    const row = await prisma.auditLog.findFirst({
      where: { companyId: companyA, entityId: 'user-x' },
    });
    expect(row).not.toBeNull();
    const after = row!.after as Record<string, unknown>;
    expect(after.email).toBe('x@example.com');
    expect(after.password).toBe('[REDACTED]');
    // Dates are preserved as ISO strings, not flattened to {}.
    expect(after.postedAt).toBe('2026-07-27T12:00:00.000Z');
    expect((after.nested as Record<string, unknown>).refreshToken).toBe(
      '[REDACTED]',
    );
    expect((after.nested as Record<string, unknown>).keep).toBe(1);
  });

  it('best-effort record swallows a write failure (no tx) and does not throw', async () => {
    // A fresh service over a prisma whose create() rejects — the no-tx path must
    // catch and log, never propagate, so auditing can't break a request.
    const failing = {
      auditLog: { create: jest.fn().mockRejectedValue(new Error('db down')) },
    } as unknown as PrismaService;
    const svc = new AuditService(failing);
    await expect(
      svc.record({ action: AuditAction.CREATE, entity: 'User' }),
    ).resolves.toBeUndefined();
  });

  it('propagates a write failure on the transactional (domain) path', async () => {
    const failing = {
      create: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const svc = new AuditService({} as PrismaService);
    await expect(
      svc.record({ action: AuditAction.POST, entity: 'JournalEntry' }, {
        auditLog: failing,
      } as unknown as Parameters<AuditService['record']>[1]),
    ).rejects.toThrow('db down');
  });

  it('scopes findAll to the caller active company', async () => {
    await audit.record({
      action: AuditAction.POST,
      entity: 'JournalEntry',
      entityId: 'je-a',
      companyId: companyA,
      userId,
    });
    await audit.record({
      action: AuditAction.POST,
      entity: 'JournalEntry',
      entityId: 'je-b',
      companyId: companyB,
      userId,
    });

    const result = await audit.findAll(
      { page: 1, limit: 50, sortBy: 'createdAt', sortOrder: 'desc' },
      callerFor(companyA),
    );

    expect(result.data.every((r) => r.companyId === companyA)).toBe(true);
    expect(result.data.some((r) => r.entityId === 'je-a')).toBe(true);
    expect(result.data.some((r) => r.entityId === 'je-b')).toBe(false);
  });

  it('filters by entity and action', async () => {
    const result = await audit.findAll(
      {
        page: 1,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        entity: 'JournalEntry',
        action: AuditAction.POST,
      },
      callerFor(companyA),
    );
    expect(result.data.length).toBeGreaterThan(0);
    expect(
      result.data.every(
        (r) => r.entity === 'JournalEntry' && r.action === AuditAction.POST,
      ),
    ).toBe(true);
  });

  it('lets a platform admin narrow to one company via companyId', async () => {
    const result = await audit.findAll(
      {
        page: 1,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        companyId: companyB,
      },
      callerFor(null, true),
    );
    expect(result.data.every((r) => r.companyId === companyB)).toBe(true);
    expect(result.data.some((r) => r.entityId === 'je-b')).toBe(true);
  });
});
