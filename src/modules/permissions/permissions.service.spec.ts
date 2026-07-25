import { Test } from '@nestjs/testing';
import { ConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule],
      providers: [PermissionsService],
    }).compile();
    service = moduleRef.get(PermissionsService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns the seeded permission catalogue, ordered by subject then action', async () => {
    const perms = await service.findAll();

    expect(perms.length).toBeGreaterThan(0);
    expect(perms.some((p) => p.key === 'permission.read')).toBe(true);

    // Every field the role-builder needs is present.
    for (const field of ['id', 'key', 'subject', 'action', 'description']) {
      expect(perms[0]).toHaveProperty(field);
    }

    // Ordered by subject asc, then action asc.
    for (let i = 1; i < perms.length; i++) {
      const prev = perms[i - 1];
      const cur = perms[i];
      expect(prev.subject <= cur.subject).toBe(true);
      if (prev.subject === cur.subject) {
        expect(prev.action <= cur.action).toBe(true);
      }
    }
  });
});
