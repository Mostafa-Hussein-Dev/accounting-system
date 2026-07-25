import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Liveness/readiness probe for load balancers and uptime monitors. Mounted at
 * `/health` OUTSIDE the `api/v1` prefix (see main.ts setGlobalPrefix exclude)
 * and public (no auth) so infra can reach it without a version or token.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({
    summary:
      'Health check — verifies the service is up and the database is reachable.',
  })
  @ApiResponse({ status: 200, description: 'Service and database are healthy' })
  @ApiResponse({ status: 503, description: 'Database is unreachable' })
  async check(): Promise<{
    status: string;
    database: string;
    uptime: number;
    timestamp: string;
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database is not reachable.',
        field: null,
      });
    }
    return {
      status: 'ok',
      database: 'up',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
